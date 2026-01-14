'use client';

import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCustomToken,
  AuthProvider,
  FacebookAuthProvider,
  OAuthProvider
} from 'firebase/auth';
import { auth, facebookProvider, microsoftProvider, appleProvider } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { socialLogin, syncUser } from '@/lib/api';
import { useGoogleSignIn } from '@/components/GoogleSignInButton';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const router = useRouter();
  const { signIn: googleSignIn } = useGoogleSignIn();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Custom Google Sign-In flow that sends token to backend FIRST
  const handleGoogleLogin = async () => {
    setError('');
    setStatusMessage('');
    setLoading(true);

    try {
      setStatusMessage('Opening Google Sign-In...');
      
      // Get access token from Google Identity Services (NOT Firebase)
      googleSignIn(
        async (accessToken: string) => {
          try {
            // Send to backend FIRST - before any Firebase auth happens
            setStatusMessage('Setting up your account...');
            console.log('Sending access token to backend...');
            
            const backendResult = await socialLogin(accessToken, 'google.com');
            console.log('Backend result:', backendResult);

            if (backendResult.success && backendResult.customToken) {
              // Sign in with custom token from backend
              setStatusMessage('Signing in...');
              await signInWithCustomToken(auth, backendResult.customToken);
              
              if (backendResult.linked) {
                console.log('Account linked successfully - password preserved!');
              }
              
              // Sync user to database
              const currentUser = auth.currentUser;
              if (currentUser) {
                await syncUser(currentUser);
              }
              
              router.push('/dashboard');
            } else {
              setError(backendResult.message || 'Failed to sign in. Please try again.');
              setLoading(false);
              setStatusMessage('');
            }
          } catch (err: any) {
            console.error('Backend error:', err);
            setError(err.message || 'Failed to sign in. Please try again.');
            setLoading(false);
            setStatusMessage('');
          }
        },
        (errorMsg: string) => {
          setError(errorMsg);
          setLoading(false);
          setStatusMessage('');
        }
      );
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
      setStatusMessage('');
    }
  };

  // Other social providers still use Firebase popup (they don't have the overwrite issue)
  const handleOtherSocialLogin = async (provider: AuthProvider, providerName: string) => {
    setError('');
    setStatusMessage('');
    setLoading(true);

    try {
      setStatusMessage(`Signing in with ${providerName}...`);
      const result = await signInWithPopup(auth, provider);
      
      // Get access token
      let accessToken: string | undefined;
      let idToken: string | undefined;
      let providerId: string;

      if (provider === facebookProvider) {
        const credential = FacebookAuthProvider.credentialFromResult(result);
        accessToken = credential?.accessToken;
        providerId = 'facebook.com';
      } else {
        const credential = OAuthProvider.credentialFromResult(result);
        accessToken = credential?.accessToken;
        idToken = credential?.idToken;
        providerId = provider === microsoftProvider ? 'microsoft.com' : 'apple.com';
      }

      if (accessToken) {
        // Call backend to ensure proper linking
        setStatusMessage('Setting up your account...');
        const backendResult = await socialLogin(accessToken, providerId, idToken);
        console.log('Backend result:', backendResult);
        
        if (backendResult.linked) {
          console.log('Account linked successfully!');
        }
      }

      await syncUser(result.user);
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Sign in to your account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="-space-y-px rounded-md shadow-sm">
            <div>
              <input
                type="email"
                required
                className="relative block w-full rounded-t-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="relative block w-full rounded-b-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">
              {error}
            </p>
          )}

          {statusMessage && (
            <p className="text-sm text-blue-600">
              {statusMessage}
            </p>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
            >
              Sign in
            </button>
          </div>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">Or continue with</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex w-full justify-center rounded-md bg-white border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4285F4] disabled:opacity-50"
          >
            Google
          </button>
          <button
            onClick={() => handleOtherSocialLogin(facebookProvider, 'Facebook')}
            disabled={loading}
            className="flex w-full justify-center rounded-md bg-[#1877F2] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#166fe5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1877F2] disabled:opacity-50"
          >
            Facebook
          </button>
          <button
            onClick={() => handleOtherSocialLogin(microsoftProvider, 'Microsoft')}
            disabled={loading}
            className="flex w-full justify-center rounded-md bg-[#2F2F2F] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#2F2F2F]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F2F2F] disabled:opacity-50"
          >
            Microsoft
          </button>
          <button
            onClick={() => handleOtherSocialLogin(appleProvider, 'Apple')}
            disabled={loading}
            className="flex w-full justify-center rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
          >
            Apple
          </button>
        </div>

        <div className="text-sm text-center">
            <Link href="/register" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Don't have an account? Register
            </Link>
          </div>
      </div>
    </div>
  );
}
