import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { syncUserToDatabase } from '../services/userService';
import { auth } from '../config/firebase';
import { handleSocialLogin, SupportedProvider } from '../services/socialAuthService';
import { Request } from 'express';

const SUPPORTED_PROVIDERS: SupportedProvider[] = ['google', 'facebook', 'microsoft'];

/**
 * POST /api/auth/login
 * Verify Firebase token and sync user to database
 */
export async function login(req: AuthRequest, res: Response) {
  const { uid, email } = req.user!;
  const { name } = req.body;

  try {
    const firebaseUser = await auth.getUser(uid);
    
    const result = await syncUserToDatabase({
      uid,
      email,
      name: name || firebaseUser.displayName || email?.split('@')[0],
    });

    if (result.emailMissing) {
      return res.json({
        success: true,
        user: { firebaseUid: uid, providers: firebaseUser.providerData.map(p => p.providerId) }
      });
    }

    res.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        firebaseUid: uid,
        providers: firebaseUser.providerData.map(p => p.providerId),
      }
    });
  } catch (error) {
    console.error('[authController] Login error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete login' });
  }
}

/**
 * POST /api/auth/register
 * Register new user - verify Firebase token and create user in database
 */
export async function register(req: AuthRequest, res: Response) {
  const { uid, email } = req.user!;
  const { name } = req.body;

  try {
    const firebaseUser = await auth.getUser(uid);
    
    const result = await syncUserToDatabase({
      uid,
      email,
      name: name || firebaseUser.displayName || email?.split('@')[0],
    });

    if (result.emailMissing) {
      return res.json({
        success: true,
        user: { firebaseUid: uid, isNew: true, providers: firebaseUser.providerData.map(p => p.providerId) }
      });
    }

    res.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        firebaseUid: uid,
        providers: firebaseUser.providerData.map(p => p.providerId),
        isNew: true,
      }
    });
  } catch (error) {
    console.error('[authController] Register error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete registration' });
  }
}

/**
 * POST /api/auth/social-login-start
 * Pre-flight check for social login - verifies token and checks for conflicts
 */
export async function socialLoginStart(req: Request, res: Response) {
  const { provider, accessToken } = req.body;

  // Validate required fields
  if (!provider || !accessToken) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: provider and accessToken'
    });
  }

  // Validate provider
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      success: false,
      error: `Unsupported provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`
    });
  }

  try {
    const result = await handleSocialLogin(provider, accessToken);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error(`[authController] social-login-start error for ${provider}:`, error);

    let errorMessage = 'Failed to process social login';

    if (error.message?.includes('token verification failed')) {
      errorMessage = `Invalid or expired ${provider} access token`;
    } else if (error.message?.includes('No email')) {
      errorMessage = `Could not retrieve email from ${provider} account. Please ensure email permission is granted.`;
    }

    return res.status(400).json({ success: false, error: errorMessage });
  }
}
