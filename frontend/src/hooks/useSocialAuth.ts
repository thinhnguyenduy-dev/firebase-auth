'use client';

import { useState } from 'react';
import { AuthProvider, signInWithPopup, fetchSignInMethodsForEmail, linkWithCredential, OAuthProvider, AuthCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { login } from '@/lib/api';
import { useRouter } from 'next/navigation';

export const useSocialAuth = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [linkAccountData, setLinkAccountData] = useState<{
    email: string;
    pendingCredential?: AuthCredential;
    password?: string;
    providers: string[];
  } | null>(null);

  const router = useRouter();

  const handleSocialLogin = async (provider: AuthProvider, providerName: string) => {
    setLoading(true);
    setError('');
    setStatusMessage(`Connecting to ${providerName}...`);

    try {
      const result = await signInWithPopup(auth, provider);
      
      // If we are linking (i.e., we have a pending credential), we need to handle that instead of normal login
      // But typically, linking happens *after* we sign in with the *existing* provider.
      // So if this function is called from the modal (existing provider), we don't just "login", 
      // we might need to return the user to complete the link.
      // However, usually we can just login, and then if we have pending data, we link.

      if (linkAccountData?.pendingCredential) {
        setStatusMessage('Linking accounts...');
        await linkWithCredential(result.user, linkAccountData.pendingCredential);
        // Link successful
        setLinkAccountData(null);
        setStatusMessage('Accounts linked successfully! Redirecting...');
      } else if (linkAccountData?.password) {
         // Link the password credential to this account
         setStatusMessage('Linking password to your account...');
         if (result.user.email) {
            const credential = EmailAuthProvider.credential(result.user.email, linkAccountData.password);
            await linkWithCredential(result.user, credential);
            setStatusMessage('Password added to account! Redirecting...');
         }
         setLinkAccountData(null);
      } else if (linkAccountData) {
        // No pending credential, just logging in to the existing account
        setLinkAccountData(null);
        setStatusMessage('Logged in successfully! Redirecting...');
      }

      // Sync user with backend
      await login(result.user);
      router.push('/dashboard');

    } catch (err: any) {
      console.error("Social login error:", err);
      
      if (err.code === 'auth/account-exists-with-different-credential') {
        const email = err.customData?.email;
        const pendingCredential = OAuthProvider.credentialFromError(err);

        if (email && pendingCredential) {
          try {
            const providers = await fetchSignInMethodsForEmail(auth, email);
             
             // If email enumeration protection is ON, providers will be empty.
             // In this case, we offer all logical providers so the user can select the correct one.
             const fallbackProviders = ['google.com', 'facebook.com', 'microsoft.com', 'apple.com', 'password'];
             const availableProviders = providers.length > 0 ? providers : fallbackProviders;

             setLinkAccountData({
               email,
               pendingCredential,
               providers: availableProviders
             });
             setError(''); 
          } catch (fetchErr) {
            console.error("Error fetching sign in methods:", fetchErr);
            setError('An error occurred while checking existing accounts.');
          }
        }
      } else {
        setError(err.message || 'An error occurred during sign in.');
      }
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const checkExistingAccount = async (email: string, password?: string) => {
      try {
        setLoading(true);
        const providers = await fetchSignInMethodsForEmail(auth, email);
        const fallbackProviders = ['google.com', 'facebook.com', 'microsoft.com', 'apple.com', 'password'];
        const availableProviders = providers.length > 0 ? providers : fallbackProviders;

        setLinkAccountData({
          email,
          password,
          providers: availableProviders
        });
      } catch (err) {
        console.error("Error checking existing account:", err);
        setError('An error occurred while checking existing accounts.');
      } finally {
        setLoading(false);
      }
  };

  const closeLinkModal = () => {
    setLinkAccountData(null);
    setLoading(false);
  };

  return {
    handleSocialLogin,
    checkExistingAccount,
    loading,
    error,
    statusMessage,
    linkAccountData,
    closeLinkModal
  };
};
