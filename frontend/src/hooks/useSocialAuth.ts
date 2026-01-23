'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, appleProvider } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { handleGoogleAuthWithToken, completeSocialAuthFlow } from '@/lib/socialAuth';

declare global {
  interface Window {
    google: any;
  }
}

export type SocialProvider = 'Google' | 'Facebook' | 'Microsoft' | 'Apple';

interface UseSocialAuthReturn {
  loading: boolean;
  error: string;
  statusMessage: string;
  setError: (error: string) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
  handleSocialLogin: (provider: SocialProvider) => Promise<void>;
  initGoogleClient: () => void;
}

export function useSocialAuth(): UseSocialAuthReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const router = useRouter();
  const tokenClient = useRef<any>(null);

  const clearMessages = useCallback(() => {
    setError('');
    setStatusMessage('');
  }, []);

  const handleGoogleAuth = useCallback(async (accessToken: string) => {
    try {
      const result = await handleGoogleAuthWithToken(accessToken, setStatusMessage);
      if (!result.success) {
        setError(result.error || 'Google sign-in failed');
        return;
      }
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Google auth error:', err);
      setError(err.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  }, [router]);

  const initGoogleClient = useCallback(() => {
    if (window.google && !tokenClient.current) {
      tokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        scope: 'email profile openid',
        callback: async (tokenResponse: any) => {
          if (tokenResponse.access_token) {
            await handleGoogleAuth(tokenResponse.access_token);
          }
        },
      });
    }
  }, [handleGoogleAuth]);

  // Initialize Google client on mount if script is already loaded
  useEffect(() => {
    if (window.google) {
      initGoogleClient();
    }
  }, [initGoogleClient]);

  const handleSocialLogin = useCallback(async (providerName: SocialProvider) => {
    clearMessages();
    setLoading(true);

    try {
      if (providerName === 'Google') {
        if (tokenClient.current) {
          tokenClient.current.requestAccessToken();
        } else {
          setError('Google Sign-In is not ready yet. Please refresh.');
          setLoading(false);
        }
        return;
      }

      if (providerName === 'Facebook' || providerName === 'Microsoft') {
        const provider = providerName.toLowerCase() as 'facebook' | 'microsoft';
        const result = await completeSocialAuthFlow(provider, setStatusMessage);
        if (!result.success) {
          setError(result.error || `${providerName} sign-in failed`);
        } else {
          router.push('/dashboard');
        }
        return;
      }

      if (providerName === 'Apple') {
        setStatusMessage('Signing in with Apple...');
        const result = await signInWithPopup(auth, appleProvider);
        await login(result.user);
        router.push('/dashboard');
        return;
      }
    } catch (err: any) {
      console.error('Social login error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('An account already exists with this email. Please sign in with your original provider.');
      } else {
        setError(err.message || 'Failed to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  }, [clearMessages, router]);

  return {
    loading,
    error,
    statusMessage,
    setError,
    setLoading,
    clearMessages,
    handleSocialLogin,
    initGoogleClient,
  };
}
