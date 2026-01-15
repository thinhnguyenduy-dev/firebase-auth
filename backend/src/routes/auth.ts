import { Router, Request, Response } from 'express';
import { auth } from '../config/firebase';
import { checkAndMergeAccounts } from '../services/socialAuthService';
import { generateCode, storeCode, verifyCode } from '../services/verificationStore';
import { sendVerificationCode } from '../services/emailService';

const router = Router();

// ============================================================================
// Account Merge
// ============================================================================

interface CheckMergeRequest {
  currentUserUid: string;
}

/**
 * Check and merge duplicate accounts.
 * Called after signInWithPopup when using "Create multiple accounts" Firebase setting.
 * Handles all merge scenarios:
 * - Social → Password: Merge social into password account
 * - Password → Social: Merge social into password account  
 * - Social → Social: Merge newer into older account
 */
router.post('/check-merge', async (req: Request, res: Response) => {
  const { currentUserUid } = req.body as CheckMergeRequest;

  if (!currentUserUid) {
    return res.status(400).json({
      success: false,
      merged: false,
      message: 'Missing required field: currentUserUid'
    });
  }

  try {
    const result = await checkAndMergeAccounts(currentUserUid);
    return res.json(result);
  } catch (error: any) {
    console.error('Error in check-merge:', error);
    return res.status(500).json({
      success: false,
      merged: false,
      message: 'Failed to check/merge accounts'
    });
  }
});

// ============================================================================
// Add Password to Social Account
// ============================================================================

/**
 * Send verification code for adding password to existing OAuth account
 */
router.post('/send-verification', async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  try {
    // With "Create multiple accounts" setting, email might only be in providerData
    // First try getUserByEmail, then fallback to searching all users
    let existingUser;
    
    try {
      existingUser = await auth.getUserByEmail(email);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        // Search all users for this email in providerData
        const listResult = await auth.listUsers(1000);
        for (const user of listResult.users) {
          // Check user.email
          if (user.email === email) {
            existingUser = user;
            break;
          }
          // Check providerData emails
          for (const provider of user.providerData) {
            if (provider.email === email) {
              existingUser = user;
              break;
            }
          }
          if (existingUser) break;
        }
      } else {
        throw e;
      }
    }

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email'
      });
    }

    const hasPassword = existingUser.providerData.some(p => p.providerId === 'password');
    if (hasPassword) {
      return res.status(409).json({
        success: false,
        message: 'Account already has a password. Please use login instead.'
      });
    }

    const code = generateCode();
    storeCode(email, code);
    await sendVerificationCode(email, code);

    return res.json({
      success: true,
      message: 'Verification code sent'
    });
  } catch (error: any) {
    console.error('Error sending verification:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to send verification code'
    });
  }
});

/**
 * Add password to existing OAuth account after verification
 */
router.post('/add-password', async (req: Request, res: Response) => {
  const { email, code, password } = req.body;

  if (!email || !code || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email, code, and password are required'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters'
    });
  }

  try {
    const isValid = verifyCode(email, code);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // With "Create multiple accounts" setting, email might only be in providerData
    let existingUser;
    
    try {
      existingUser = await auth.getUserByEmail(email);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        const listResult = await auth.listUsers(1000);
        for (const user of listResult.users) {
          if (user.email === email) {
            existingUser = user;
            break;
          }
          for (const provider of user.providerData) {
            if (provider.email === email) {
              existingUser = user;
              break;
            }
          }
          if (existingUser) break;
        }
      } else {
        throw e;
      }
    }

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email'
      });
    }

    // With "Create multiple accounts" setting, social account may have email only in providerData
    // We need to set email at account level for signInWithEmailAndPassword to work
    await auth.updateUser(existingUser.uid, {
      email: email,  // Set email at account level (required for email/password login)
      password: password
    });

    return res.json({
      success: true,
      message: 'Password added successfully'
    });
  } catch (error: any) {
    console.error('Error adding password:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to add password'
    });
  }
});

export default router;
