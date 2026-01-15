import { Router, Request, Response } from 'express';
import { handleGoogleLogin } from '../services/socialAuthService';

const router = Router();

// ============================================================================
// Social Auth (Google Start)
// ============================================================================

/**
 * Handle Google Sign-In with backend verification.
 * 
 * Ensures that if a user already exists with a password account, they can safely
 * link the Google provider without overwriting their password credential.
 */
router.post('/google-start', async (req: Request, res: Response) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    return res.status(400).json({
      success: false,
      message: 'Missing required field: accessToken'
    });
  }

  try {
    const result = await handleGoogleLogin(accessToken);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error in google-start:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process Google login'
    });
  }
});

/**
 * Get providers for an email (Secure Backend Check).
 * 
 * Bypasses client-side "Email Enumeration Protection" by running on the backend.
 * Only call this when you already have an email conflict.
 */
router.post('/get-providers', async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Missing required field: email'
    });
  }

  try {
    const { getProvidersByEmail } = await import('../services/socialAuthService');
    const providers = await getProvidersByEmail(email);
    return res.json({ success: true, providers });
  } catch (error: any) {
    console.error('Error in get-providers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch providers'
    });
  }
});

export default router;
