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
    const existingUser = await auth.getUserByEmail(email);

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

    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email'
      });
    }

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

    const existingUser = await auth.getUserByEmail(email);

    await auth.updateUser(existingUser.uid, {
      password: password
    });

    return res.json({
      success: true,
      message: 'Password added successfully'
    });
  } catch (error: any) {
    console.error('Error adding password:', error);

    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to add password'
    });
  }
});

export default router;
