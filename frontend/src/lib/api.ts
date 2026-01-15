import { User } from 'firebase/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ============================================================================
// Social Auth (Safe Flow)
// ============================================================================

export interface GoogleLoginResponse {
  success: boolean;
  action: 'signin' | 'link';
  customToken?: string;
  email?: string;
  message?: string;
}

/**
 * Handle Google Login safely to prevent password account overwrite.
 * 
 * Sends the Google ID Token to the backend to check for conflicts BEFORE
 * signing in to Firebase.
 * 
 * Returns:
 * - action: 'signin' -> No conflict, proceed with standard Google credential sign-in
 * - action: 'link'   -> Conflict detected, use customToken to sign in, then Link credential
 */
export const googleSafeLogin = async (
  accessToken: string
): Promise<GoogleLoginResponse> => {
  const res = await fetch(`${API_URL}/api/auth/google-start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  return res.json();
};

// ============================================================================
// User Sync
// ============================================================================

export const getProvidersForEmail = async (email: string): Promise<string[]> => {
  try {
    const res = await fetch(`${API_URL}/api/auth/get-providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    
    if (!res.ok) throw new Error('Failed to fetch providers');
    const data = await res.json();
    return data.providers || [];
  } catch (err) {
    console.error('Error fetching providers:', err);
    return [];
  }
};

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
