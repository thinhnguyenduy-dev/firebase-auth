import { auth } from '../config/firebase';
import { verifyProviderToken } from './providerVerifier';

interface SocialAuthResult {
  success: boolean;
  customToken?: string;
  linked: boolean;
  message: string;
  email?: string;
}

/**
 * Handles social authentication with proper provider linking.
 * This prevents Google from overwriting existing password providers.
 * 
 * Flow:
 * 1. Verify the OAuth token with the provider
 * 2. Check if user exists with password provider
 * 3. If yes, LINK the OAuth provider (preserving password)
 * 4. Create custom token for frontend sign-in
 */
export async function handleSocialAuth(
  providerId: string,
  accessToken: string,
  idToken?: string
): Promise<SocialAuthResult> {
  // 1. Verify the OAuth token with the provider and get user info
  const providerInfo = await verifyProviderToken(providerId, accessToken, idToken);
  const email = providerInfo.email;

  if (!email) {
    return {
      success: false,
      linked: false,
      message: 'Could not retrieve email from OAuth provider',
    };
  }

  let user;
  let linked = false;
  let isNewUser = false;

  try {
    // 2. Check if user exists
    user = await auth.getUserByEmail(email);
    
    // Check existing providers
    const hasPasswordProvider = user.providerData.some(p => p.providerId === 'password');
    const hasOAuthProvider = user.providerData.some(p => p.providerId === providerId);

    // 3. If user has password but not this OAuth provider, link it
    if (!hasOAuthProvider) {
      await auth.updateUser(user.uid, {
        providerToLink: {
          providerId: providerId,
          uid: providerInfo.providerUid,
        },
      });
      linked = hasPasswordProvider; // Only mark as "linked" if preserving password
    }

  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      // Create new user with the OAuth provider
      user = await auth.createUser({
        email: email,
        emailVerified: true,
        displayName: providerInfo.displayName,
        photoURL: providerInfo.photoURL,
      });

      // Link the provider to the new user
      await auth.updateUser(user.uid, {
        providerToLink: {
          providerId: providerId,
          uid: providerInfo.providerUid,
        },
      });

      isNewUser = true;
    } else {
      throw error;
    }
  }

  // 4. Create custom token for frontend sign-in
  const customToken = await auth.createCustomToken(user.uid);

  return {
    success: true,
    customToken,
    linked,
    email,
    message: isNewUser
      ? 'Account created successfully'
      : linked
        ? 'OAuth provider linked to existing account (password preserved)'
        : 'Signed in successfully',
  };
}
