'use client';

import { useState, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCustomToken,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  AuthProvider,
  linkWithCredential
} from 'firebase/auth';
import { auth, googleProvider, facebookProvider, microsoftProvider, appleProvider } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { googleSafeLogin, syncUser, getProvidersForEmail } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Script from 'next/script';

declare global {
  interface Window {
    google: any;
  }
}

export default function HomePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  // State for Account Linking (Popup Blocked Fix)
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [pendingCred, setPendingCred] = useState<any>(null);
  
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  // Google Token Client ref
  const tokenClient = useRef<any>(null);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Initialize Google Token Client
   */
  const initGoogleClient = () => {
    if (window.google) {
      tokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        scope: 'email profile openid',
        callback: async (tokenResponse: any) => {
          if (tokenResponse.access_token) {
            await handleGoogleSafeLogin(tokenResponse.access_token);
          }
        },
      });
    }
  };

  /**
   * Handle Safe Google Login Flow
   */
  const handleGoogleSafeLogin = async (accessToken: string) => {
    setStatusMessage('Verifying account...');
    try {
      // 1. Send Access Token to Backend for safe verification
      const result = await googleSafeLogin(accessToken);

      if (!result.success) {
        throw new Error(result.message || 'Google login failed on server');
      }

      if (result.action === 'link') {
        setStatusMessage('Linking specific account...');
        
        // 2a. LINK CASE: Sign in with Custom Token (as the password user)
        if (!result.customToken) throw new Error('No custom token returned for linking');
        
        await signInWithCustomToken(auth, result.customToken);
        
        // 2b. Link the Google Credential to this user
        // Note: We use the Access Token to create the credential
        const credential = GoogleAuthProvider.credential(null, accessToken);
        const currentUser = auth.currentUser;
        
        if (currentUser) {
          await linkWithCredential(currentUser, credential);
          await syncUser(currentUser);
          setStatusMessage('Account successfully linked!');
        }

      } else {
        // 2c. SIGNIN CASE: Standard Sign-In
        setStatusMessage('Signing in...');
        const credential = GoogleAuthProvider.credential(null, accessToken);
        const userCred = await signInWithCredential(auth, credential);
        await syncUser(userCred.user);
      }

      router.push('/dashboard');

    } catch (err: any) {
      console.error('Google Safe Login Error:', err);
      // Handle "Credential already in use" if it happens during linking race condition
      if (err.code === 'auth/credential-already-in-use') {
        setError('This Google account is already linked to another user.');
      } else {
        setError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const handleSocialLogin = async (provider: AuthProvider, providerName: string) => {
    setError('');
    setStatusMessage('');
    setLoading(true);

    // Special handling for Google to prevent overwrite
    if (providerName === 'Google') {
      if (tokenClient.current) {
        // Trigger GIS Flow
        tokenClient.current.requestAccessToken();
      } else {
        setError('Google Sign-In is not ready yet. Please refresh.');
        setLoading(false);
      }
      return;
    }

    // Standard Flow for other providers
    try {
      setStatusMessage(`Signing in with ${providerName}...`);
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      await syncUser(user);
      router.push('/dashboard');

    } catch (err: any) {
      console.error('Social login error:', err);
      
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        const email = err.customData?.email;
        const pendingCredential = OAuthProvider.credentialFromError(err);
        
        console.log('Merge Logic - Email:', email);
        console.log('Merge Logic - Pending Credential:', pendingCredential);

        if (email && pendingCredential) {
          try {
            // Check established providers (via Backend to bypass Enumeration Protection)
            const methods = await getProvidersForEmail(email);
            console.log('Merge Logic - Existing Methods:', methods);

            if (methods.includes('google.com')) {
              setStatusMessage('Existing Google account found.');
              // Cannot auto-popup due to async delay blocking it.
              // We must ask user to click.
              setPendingCred(pendingCredential);
              setVerificationNeeded(true);
              return;
            } else if (methods.includes('password')) {
               setError(`An account already exists with ${email}. Please sign in with your password to link this account.`);
            } else {
               // Fallback
               setError(`An account already exists with ${email}. Please sign in with your original provider.`);
            }
          } catch (linkErr: any) {
            console.error('Linking error:', linkErr);
            setError('Failed to link account: ' + linkErr.message);
          }
        } else {
             console.warn('Merge Logic - Missing email or credential');
             setError('An account already exists with this email.');
        }

      } else {
        setError(err.message || 'Failed to sign in. Please try again.');
      }
    } finally {
      if (!error) setLoading(false);
      // setStatusMessage(''); // Keep status message if redirecting
    }
  };

  const handleManualLink = async () => {
    if (!pendingCred) return;
    setLoading(true);
    setStatusMessage('Verifying to link...');
    try {
       const result = await signInWithPopup(auth, googleProvider);
       await linkWithCredential(result.user, pendingCred);
       await syncUser(result.user);
       setStatusMessage('Account successfully linked!');
       router.push('/dashboard');
    } catch (err: any) {
      console.error('Manual Linking Error:', err);
      setError('Failed to link: ' + err.message);
      setVerificationNeeded(false);
      setPendingCred(null);
    } finally {
      setLoading(false);
    }
  };

  // If verification needed, show special UI
  if (verificationNeeded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="relative w-full max-w-md backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-8 space-y-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-yellow-500/20 text-yellow-500 mb-4">
               <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
               </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">Account Conflict</h2>
            <p className="text-white/80">
              You already have a Google account registered with this email. 
              Please verify with Google to link your Facebook account.
            </p>
            
            {error && <p className="text-red-400 text-sm">{error}</p>}
            
            <button
               onClick={handleManualLink}
               disabled={loading}
               className="w-full py-3 px-4 bg-white text-gray-900 font-bold rounded-xl hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
            >
               {loading ? 'Verifying...' : 'Verify with Google'}
            </button>
            
            <button
               onClick={() => { setVerificationNeeded(false); setPendingCred(null); setError(''); }}
               className="text-white/40 text-sm hover:text-white"
            >
              Cancel
            </button>
        </div>
      </div>
    );
  }

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="animate-pulse text-white text-lg">Loading...</div>
      </div>
    );
  }

  // Don't render login form if already logged in (will redirect)
  if (user) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <Script 
        src="https://accounts.google.com/gsi/client" 
        strategy="afterInteractive"
        onLoad={initGoogleClient}
      />

      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Glass card */}
        <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-8 space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Welcome Back
            </h1>
            <p className="text-white/60">
              Sign in to continue to your account
            </p>
          </div>

          {/* Login Form */}
          <form className="space-y-5" onSubmit={handleLogin}>
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="email"
                  required
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all duration-200"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="relative">
                <input
                  type="password"
                  required
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all duration-200"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {statusMessage && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <svg className="w-5 h-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-sm text-blue-400">{statusMessage}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-transparent text-white/40">Or continue with</span>
            </div>
          </div>

          {/* Social Login Buttons */}
          <div className="grid grid-cols-2 gap-3">

            <button
              onClick={() => handleSocialLogin(googleProvider, 'Google')}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded-xl transition-all duration-200 disabled:opacity-50 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </button>
            <button
              onClick={() => handleSocialLogin(facebookProvider, 'Facebook')}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-3 px-4 bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Facebook
            </button>
            <button
              onClick={() => handleSocialLogin(microsoftProvider, 'Microsoft')}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-3 px-4 bg-[#2F2F2F] hover:bg-[#404040] text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#F25022" d="M1 1h10v10H1z"/>
                <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                <path fill="#FFB900" d="M13 13h10v10H13z"/>
              </svg>
              Microsoft
            </button>
            <button
              onClick={() => handleSocialLogin(appleProvider, 'Apple')}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-3 px-4 bg-black hover:bg-gray-900 text-white font-medium rounded-xl border border-white/10 transition-all duration-200 disabled:opacity-50 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Apple
            </button>
          </div>

          {/* Register Link */}
          <p className="text-center text-white/60">
            Don't have an account?{' '}
            <Link href="/register" className="text-purple-400 hover:text-purple-300 font-semibold transition-colors">
              Create one
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-white/30 text-sm mt-8">
          Firebase Authentication Demo
        </p>
      </div>
    </div>
  );
}
