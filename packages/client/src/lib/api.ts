import { User, OAuthCredential } from 'firebase/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const linkProvider = async (
  credential: OAuthCredential,
  providerId: string,
  email: string
): Promise<{ success: boolean; message: string }> => {
  const res = await fetch(`${API_URL}/api/auth/link-provider`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accessToken: credential.accessToken,
      idToken: credential.idToken,
      providerId,
      email,
    }),
  });

  return res.json();
};

export const sendVerificationCode = async (
  email: string
): Promise<{ success: boolean; message: string }> => {
  const res = await fetch(`${API_URL}/api/auth/send-verification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, code, password }),
  });

  return res.json();
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
