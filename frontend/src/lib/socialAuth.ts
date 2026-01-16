/**
 * Unified Social Auth Handler
 *
 * Provides a consistent flow for social authentication across all providers
 * (Google, Facebook, Microsoft) with backend-orchestrated conflict detection.
 */

import {
  signInWithCustomToken,
  signInWithCredential,
  signInWithPopup,
  linkWithCredential,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  AuthCredential,
  User
} from 'firebase/auth';
import { auth, googleProvider, facebookProvider, microsoftProvider } from './firebase';
import { socialAuthPreflight, syncUser, SupportedProvider } from './api';

export interface SocialAuthResult {
  success: boolean;
  user?: User;
  linked?: boolean;
  error?: string;
}

interface OAuthTokens {
  accessToken: string;
  idToken?: string;
  credential: AuthCredential;
  fromError?: boolean;
  user?: User;  // User from popup if already signed in successfully
}

/**
 * Get the Firebase AuthProvider instance for a provider
 */
function getAuthProvider(provider: SupportedProvider) {
  switch (provider) {
    case 'google':
      return googleProvider;
    case 'facebook':
      return facebookProvider;
    case 'microsoft':
      return microsoftProvider;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Execute OAuth popup and extract access token AND credential.
 * Returns user if popup succeeds (provider already linked).
 */
export async function getOAuthAccessToken(
  provider: SupportedProvider
): Promise<OAuthTokens | null> {
  const authProvider = getAuthProvider(provider);

  try {
    const result = await signInWithPopup(auth, authProvider);

    let credential;
    if (provider === 'google') {
      credential = GoogleAuthProvider.credentialFromResult(result);
    } else if (provider === 'facebook') {
      credential = FacebookAuthProvider.credentialFromResult(result);
    } else if (provider === 'microsoft') {
      credential = OAuthProvider.credentialFromResult(result);
    }

    if (!credential) {
      throw new Error('Failed to get credential from popup result');
    }

    return {
      accessToken: credential.accessToken || '',
      idToken: credential.idToken,
      credential: credential,
      fromError: false,
      user: result.user  // Return the already-signed-in user
    };
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      return null;
    }

    if (error.code === 'auth/account-exists-with-different-credential') {
      let credential;
      if (provider === 'facebook') {
        credential = FacebookAuthProvider.credentialFromError(error);
      } else {
        credential = OAuthProvider.credentialFromError(error);
      }

      if (credential) {
        return {
          accessToken: credential.accessToken || '',
          idToken: credential.idToken,
          credential: credential,
          fromError: true
        };
      }
    }

    throw error;
  }
}

// =============================================================================
// Shared Auth Flow Execution
// =============================================================================

interface AuthActionParams {
  action: 'signin' | 'link';
  customToken?: string;
  credential: AuthCredential;
  provider: string;
  onStatusUpdate?: (message: string) => void;
}

/**
 * Execute the authentication action (signin or link).
 * This is the shared core logic used by all social auth flows.
 */
async function executeAuthAction(params: AuthActionParams): Promise<SocialAuthResult> {
  const { action, customToken, credential, provider, onStatusUpdate } = params;

  if (action === 'link') {
    onStatusUpdate?.(`Linking ${provider} to existing account...`);

    if (!customToken) {
      return { success: false, error: 'No custom token returned for linking' };
    }

    await signInWithCustomToken(auth, customToken);
    const currentUser = auth.currentUser;

    if (!currentUser) {
      return { success: false, error: 'Failed to sign in with custom token' };
    }

    await linkWithCredential(currentUser, credential);
    await syncUser(currentUser);

    onStatusUpdate?.('Account successfully linked!');
    return { success: true, user: currentUser, linked: true };
  }

  // SIGNIN FLOW
  onStatusUpdate?.('Signing in...');
  const userCred = await signInWithCredential(auth, credential);
  await syncUser(userCred.user);

  return { success: true, user: userCred.user, linked: false };
}

/**
 * Handle common Firebase auth errors
 */
function handleFirebaseError(error: any, provider: string): SocialAuthResult {
  if (error.code === 'auth/credential-already-in-use') {
    return { success: false, error: `This ${provider} account is already linked to another user.` };
  }

  if (error.code === 'auth/provider-already-linked') {
    return { success: false, error: `Your account is already linked to a ${provider} account.` };
  }

  if (error.code === 'auth/email-already-in-use') {
    return { success: false, error: 'This email is already associated with another account.' };
  }

  return { success: false, error: error.message || 'An unexpected error occurred' };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Handle Google authentication using GIS token.
 */
export async function handleGoogleAuthWithToken(
  accessToken: string,
  onStatusUpdate?: (message: string) => void
): Promise<SocialAuthResult> {
  try {
    onStatusUpdate?.('Verifying account...');
    const backendResult = await socialAuthPreflight('google', accessToken);

    if (!backendResult.success) {
      return { success: false, error: backendResult.error || 'Backend verification failed' };
    }

    const credential = GoogleAuthProvider.credential(null, accessToken);

    return await executeAuthAction({
      action: backendResult.action,
      customToken: backendResult.customToken,
      credential,
      provider: 'Google',
      onStatusUpdate
    });
  } catch (error: any) {
    console.error('[handleGoogleAuthWithToken] Error:', error);
    return handleFirebaseError(error, 'Google');
  }
}

/**
 * Unified social authentication flow with backend orchestration.
 */
export async function handleUnifiedSocialAuth(
  provider: SupportedProvider,
  accessToken: string,
  credential: AuthCredential,
  onStatusUpdate?: (message: string) => void
): Promise<SocialAuthResult> {
  try {
    onStatusUpdate?.('Verifying account...');
    const backendResult = await socialAuthPreflight(provider, accessToken);

    if (!backendResult.success) {
      return { success: false, error: backendResult.error || 'Backend verification failed' };
    }

    return await executeAuthAction({
      action: backendResult.action,
      customToken: backendResult.customToken,
      credential,
      provider,
      onStatusUpdate
    });
  } catch (error: any) {
    console.error('[handleUnifiedSocialAuth] Error:', error);
    return handleFirebaseError(error, provider);
  }
}

/**
 * Complete social auth flow for Facebook/Microsoft.
 * 
 * Optimized flow:
 * - If popup succeeds (user already has provider linked), just sync and return
 * - If popup fails with conflict, sign out and call backend for linking
 */
export async function completeSocialAuthFlow(
  provider: 'facebook' | 'microsoft',
  onStatusUpdate?: (message: string) => void
): Promise<SocialAuthResult> {
  try {
    onStatusUpdate?.(`Signing in with ${provider}...`);

    const tokens = await getOAuthAccessToken(provider);

    if (!tokens) {
      return { success: false, error: 'Sign-in was cancelled' };
    }

    // If popup succeeded without error, user is already signed in
    // Just sync and return - no need for backend verification
    if (!tokens.fromError && tokens.user) {
      onStatusUpdate?.('Completing sign-in...');
      await syncUser(tokens.user);
      return { success: true, user: tokens.user, linked: false };
    }

    // If popup failed with conflict error, we need backend orchestration
    // Sign out first (user wasn't signed in due to error)
    if (!tokens.fromError) {
      await auth.signOut();
    }

    return await handleUnifiedSocialAuth(
      provider,
      tokens.accessToken,
      tokens.credential,
      onStatusUpdate
    );
  } catch (error: any) {
    console.error(`[completeSocialAuthFlow] Error for ${provider}:`, error);

    if (error.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'Sign-in was cancelled' };
    }

    return { success: false, error: error.message || 'Failed to sign in' };
  }
}

