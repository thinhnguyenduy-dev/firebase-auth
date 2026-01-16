import { User } from 'firebase/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ============================================================================
// Types
// ============================================================================

export type SupportedProvider = 'google' | 'facebook' | 'microsoft';

export interface SocialLoginResponse {
  success: boolean;
  action: 'signin' | 'link';
  customToken?: string;
  existingUid?: string;
  email?: string;
  existingProviders?: string[];
  message?: string;
  error?: string;
}

// ============================================================================
// Unified Social Auth
// ============================================================================

/**
 * Unified social login pre-flight check.
 *
 * Sends OAuth access token to backend for verification and conflict detection
 * BEFORE signing into Firebase.
 *
 * Usage:
 * 1. Get access token from provider popup
 * 2. Call this function
 * 3. If action === 'link': Sign in with customToken, then linkWithCredential
 * 4. If action === 'signin': Sign in normally with credential
 */
export const socialLoginStart = async (
  provider: SupportedProvider,
  accessToken: string
): Promise<SocialLoginResponse> => {
  try {
    const res = await fetch(`${API_URL}/api/auth/social-login-start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, accessToken }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        action: 'signin',
        error: data.error || 'Failed to verify social login'
      };
    }

    return data;
  } catch (error: any) {
    return {
      success: false,
      action: 'signin',
      error: error.message || 'Network error'
    };
  }
};

// ============================================================================
// User Sync
// ============================================================================

export const syncUser = async (user: User) => {
  const token = await user.getIdToken();

  try {
    const res = await fetch(`${API_URL}/api/users/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: user.displayName || user.email?.split('@')[0],
      }),
    });

    if (!res.ok) {
      throw new Error('Failed to sync user');
    }

    return await res.json();
  } catch (error) {
    console.error('Error syncing user:', error);
  }
};
