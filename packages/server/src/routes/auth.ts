import { Router, Request, Response } from 'express';
import { auth } from '../config/firebase';
import { verifyProviderToken } from '../services/providerVerifier';

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

export default router;
