import { auth } from '../config/firebase';

interface SocialLoginResult {
  action: 'signin' | 'link';
  customToken?: string;
  email?: string;
  message?: string;
}

/**
 * Handle Google Sign-In with conflict detection.
 * 
 * Prevents the "Overwrite" issue where signing in with Google automatically
 * wipes out the password credential for an existing email/password user.
 * 
 * Flow:
 * 1. Verify Google Access Token (call UserInfo).
 * 2. Check if user exists by email.
 * 3. IF user exists AND has 'password' provider:
 *    - Return { action: 'link', customToken }
 *    - Client triggers linkWithCredential()
 * 4. ELSE:
 *    - Return { action: 'signin' }
 *    - Client triggers signInWithCredential()
 */
export async function handleGoogleLogin(accessToken: string): Promise<SocialLoginResult> {
  try {
    // 1. Verify the Google Access Token by fetching User Info
    const userInfo = await fetchGoogleUserInfo(accessToken);
    const email = userInfo.email;

    if (!email) {
      throw new Error('No email found in Google account.');
    }

    // 2. Check if user exists in Firebase
    try {
      const userRecord = await auth.getUserByEmail(email);
      
      // 3. Check for conflict (Existing Password User)
      const hasPassword = userRecord.providerData.some(p => p.providerId === 'password');
      const hasGoogle = userRecord.providerData.some(p => p.providerId === 'google.com');

      if (hasPassword && !hasGoogle) {
        // CASE: Account Linking Required
        console.log(`[handleGoogleLogin] Conflict detected for ${email}. Returning custom token for linking.`);
        
        const customToken = await auth.createCustomToken(userRecord.uid);
        
        return {
          action: 'link',
          customToken,
          email,
          message: 'Account exists with password. Linking Google account...'
        };
      }
      
      // If already has google, or is social-only, or doesn't exist yet -> Standard Sign-In
      return { action: 'signin' };

    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // New user -> Standard Sign-In
        return { action: 'signin' };
      }
      throw error;
    }

  } catch (error: any) {
    console.error('Error in handleGoogleLogin:', error);
    throw new Error('Failed to process Google login');
  }
}

export async function getProvidersByEmail(email: string): Promise<string[]> {
  try {
    const user = await auth.getUserByEmail(email);
    return user.providerData.map((p: any) => p.providerId);
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      return [];
    }
    throw error;
  }
}

// Helper to fetch Google User Info using Access Token
async function fetchGoogleUserInfo(accessToken: string): Promise<{ email?: string, sub?: string }> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Google UserInfo failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch Google User Info:', error);
    throw new Error('Invalid Google Access Token');
  }
}
