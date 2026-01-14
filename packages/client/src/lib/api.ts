import { User } from 'firebase/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
