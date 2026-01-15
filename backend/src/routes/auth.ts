import { Router, Request, Response } from 'express';
import { auth } from '../config/firebase';
import { verifyProviderToken } from '../services/providerVerifier';
import { handleSocialAuth, checkAndMergeAccounts } from '../services/socialAuthService';
import { generateCode, storeCode, verifyCode } from '../services/verificationStore';
import { sendVerificationCode } from '../services/emailService';

const router = Router();

interface LinkProviderRequest {
  accessToken: string;
  providerId: string;
  email: string;
  idToken?: string;
}

router.post('/link-provider', async (req: Request, res: Response) => {
  const { accessToken, providerId, email, idToken } = req.body as LinkProviderRequest;

  if (!accessToken || !providerId || !email) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: accessToken, providerId, email'
    });
  }

  try {
    // 1. Verify the OAuth token with the provider and get provider UID
    const providerInfo = await verifyProviderToken(providerId, accessToken, idToken);

    // 2. Find the existing Firebase user by email
    let existingUser;
    try {
      existingUser = await auth.getUserByEmail(email);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({
          success: false,
          message: 'No existing account found with this email'
        });
      }
      throw error;
    }

    // 3. Check if provider is already linked
    const existingProviders = existingUser.providerData.map(p => p.providerId);
    if (existingProviders.includes(providerId)) {
      return res.status(409).json({
        success: false,
        message: 'Provider is already linked to this account'
      });
    }

    // 4. Link the new provider to the existing account
    await auth.updateUser(existingUser.uid, {
      providerToLink: {
        providerId: providerId,
        uid: providerInfo.providerUid,
      },
    });

    return res.json({
      success: true,
      message: 'Provider linked successfully'
    });

  } catch (error: any) {
    console.error('Error linking provider:', error);

    if (error.message?.includes('Invalid') || error.message?.includes('token')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired OAuth token'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to link provider'
    });
  }
});

// Social login endpoint - handles OAuth login with proper provider linking
// This prevents Google from overwriting existing password providers
interface SocialLoginRequest {
  accessToken: string;
  providerId: string;
  idToken?: string;
}

router.post('/social-login', async (req: Request, res: Response) => {
  const { accessToken, providerId, idToken } = req.body as SocialLoginRequest;

  if (!accessToken || !providerId) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: accessToken, providerId'
    });
  }

  try {
    const result = await handleSocialAuth(providerId, accessToken, idToken);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);

  } catch (error: any) {
    console.error('Error in social login:', error);

    if (error.message?.includes('Invalid') || error.message?.includes('token')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired OAuth token'
      });
    }

    if (error.message?.includes('Unsupported provider')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to process social login'
    });
  }
});

// Check and merge duplicate accounts
// Called after signInWithPopup when using "Create multiple accounts" Firebase setting
// This detects if the current user is a duplicate and merges it with the password account
interface CheckMergeRequest {
  currentUserUid: string;
}

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

// Send verification code for adding password to existing OAuth account
router.post('/send-verification', async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  try {
    // Check if user exists in Firebase
    const existingUser = await auth.getUserByEmail(email);

    // Check if user already has password provider
    const hasPassword = existingUser.providerData.some(p => p.providerId === 'password');
    if (hasPassword) {
      return res.status(409).json({
        success: false,
        message: 'Account already has a password. Please use login instead.'
      });
    }

    // Generate and store code
    const code = generateCode();
    storeCode(email, code);

    // Send email
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

// Add password to existing OAuth account after verification
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
    // Verify the code
    const isValid = verifyCode(email, code);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Get the existing user
    const existingUser = await auth.getUserByEmail(email);

    // Add password to the user
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
