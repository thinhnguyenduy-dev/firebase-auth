import { User } from 'firebase/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ============================================================================
// Account Merge API
// ============================================================================

export interface CheckMergeResponse {
  success: boolean;
  merged: boolean;
  customToken?: string;
  message: string;
}

/**
 * Check and merge duplicate accounts.
 * Called after signInWithPopup or createUserWithEmailAndPassword.
 * Handles all merge scenarios:
 * - Social → Password: Merge social into password account
 * - Password → Social: Merge social into password account  
 * - Social → Social: Merge newer into older account
 */
export const checkMerge = async (
  currentUserUid: string
): Promise<CheckMergeResponse> => {
  const res = await fetch(`${API_URL}/api/auth/check-merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentUserUid }),
  });
  return res.json();
};

// ============================================================================
// Add Password to Social Account
// ============================================================================

export const sendVerificationCode = async (
  email: string
): Promise<{ success: boolean; message: string }> => {
  const res = await fetch(`${API_URL}/api/auth/send-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return res.json();
};

export const addPasswordToAccount = async (
  email: string,
  code: string,
  password: string
): Promise<{ success: boolean; message: string }> => {
  const res = await fetch(`${API_URL}/api/auth/add-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, password }),
  });
  return res.json();
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
