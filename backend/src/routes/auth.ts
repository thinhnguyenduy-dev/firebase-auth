import { Router, Request, Response } from 'express';
import { handleSocialLogin, SupportedProvider } from '../services/socialAuthService';

const router = Router();

// ============================================================================
// Unified Social Auth Endpoint
// ============================================================================

const SUPPORTED_PROVIDERS: SupportedProvider[] = ['google', 'facebook', 'microsoft'];

/**
 * Unified social login pre-flight check.
 *
 * Verifies OAuth access token and checks for account conflicts BEFORE
 * the frontend signs into Firebase.
 *
 * Supported providers: google, facebook, microsoft
 */
router.post('/social-login-start', async (req: Request, res: Response) => {
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
    console.error(`[social-login-start] Error for ${provider}:`, error);

    // Provide user-friendly error messages
    let errorMessage = 'Failed to process social login';

    if (error.message?.includes('token verification failed')) {
      errorMessage = `Invalid or expired ${provider} access token`;
    } else if (error.message?.includes('No email')) {
      errorMessage = `Could not retrieve email from ${provider} account. Please ensure email permission is granted.`;
    }

    return res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
});

export default router;
