'use client';

import { useState } from 'react';
import { signInWithPopup, signInWithCustomToken, AuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkAccountLink, login } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface UseSocialAuthResult {
  handleSocialLogin: (provider: AuthProvider, providerName: string) => Promise<void>;
  loading: boolean;
  statusMessage: string;
  error: string;
  clearError: () => void;
}

/**
 * Hook for handling social login with account linking support.
 */
export function useSocialAuth(): UseSocialAuthResult {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const clearError = () => setError('');

  const handleSocialLogin = async (provider: AuthProvider, providerName: string) => {
    setError('');
    setStatusMessage('');
    setLoading(true);

    try {
      setStatusMessage(`Signing in with ${providerName}...`);
      const result = await signInWithPopup(auth, provider);
      let user = result.user;
      
      setStatusMessage('Setting up your account...');
      const linkResult = await checkAccountLink(user.uid);
      console.log('Link check result:', linkResult);

      if (linkResult.linked && linkResult.customToken) {
        console.log('Accounts linked! Signing in with linked account...');
        setStatusMessage('Accounts linked successfully!');
        await signInWithCustomToken(auth, linkResult.customToken);
        user = auth.currentUser!;
      }

      // Sync to database
      await login(user);
      router.push('/dashboard');

    } catch (err: any) {
      console.error('Social login error:', err);
      
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError(`An account already exists with this email. Please sign in with your original method first.`);
      } else {
        setError(err.message || 'Failed to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  return { handleSocialLogin, loading, statusMessage, error, clearError };
}
