'use client';

import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  AuthProvider,
  OAuthProvider,
  GoogleAuthProvider,
  FacebookAuthProvider
} from 'firebase/auth';
import { auth, googleProvider, facebookProvider, microsoftProvider, appleProvider } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { linkProvider, syncUser } from '@/lib/api';
import AddPasswordModal from '@/components/AddPasswordModal';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [linking, setLinking] = useState(false);
  const [showAddPasswordModal, setShowAddPasswordModal] = useState(false);
  const [modalEmail, setModalEmail] = useState('');
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        // Show modal to add password to existing account
        setModalEmail(email);
        setShowAddPasswordModal(true);
        setError('');
      } else {
        setError(err.message);
      }
    }
  };

  const handleSocialLogin = async (provider: AuthProvider) => {
    setError('');
    try {
      await signInWithPopup(auth, provider);
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/account-exists-with-different-credential') {
        // Extract credential from error
        const credential = OAuthProvider.credentialFromError(err) ||
          GoogleAuthProvider.credentialFromError(err) ||
          FacebookAuthProvider.credentialFromError(err);
        const email = err.customData?.email;

        if (!email || !credential) {
          setError('Could not link account. Please try logging in with your existing provider.');
          return;
        }

        // Get provider ID from the credential
        const providerId = credential.providerId;

        try {
          setLinking(true);
          setError('Linking your accounts...');

          // Call backend to link the provider
          const result = await linkProvider(credential, providerId, email);

          if (result.success) {
            // Sign in directly using the credential (no popup needed)
            const userCredential = await signInWithCredential(auth, credential);
            // Sync user to database before redirecting
            await syncUser(userCredential.user);
            router.push('/dashboard');
          } else {
            setError(result.message || 'Failed to link accounts. Please try again.');
          }
        } catch (linkErr: any) {
          console.error('Linking error:', linkErr);
          setError('Failed to link accounts. Please try signing in with your original provider.');
        } finally {
          setLinking(false);
        }
      } else {
        setError(err.message);
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Create your account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleRegister}>
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
            <p className={`text-sm ${linking ? 'text-blue-600' : 'text-red-500'}`}>
              {error}
            </p>
          )}

          <div>
            <button
              type="submit"
              disabled={linking}
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
            >
              Sign up
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
            onClick={() => handleSocialLogin(googleProvider)}
            disabled={linking}
            className="flex w-full justify-center rounded-md bg-white border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4285F4] disabled:opacity-50"
          >
            Google
          </button>
          <button
            onClick={() => handleSocialLogin(facebookProvider)}
            disabled={linking}
            className="flex w-full justify-center rounded-md bg-[#1877F2] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#166fe5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1877F2] disabled:opacity-50"
          >
            Facebook
          </button>
          <button
            onClick={() => handleSocialLogin(microsoftProvider)}
            disabled={linking}
            className="flex w-full justify-center rounded-md bg-[#2F2F2F] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#2F2F2F]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F2F2F] disabled:opacity-50"
          >
            Microsoft
          </button>
          <button
            onClick={() => handleSocialLogin(appleProvider)}
            disabled={linking}
            className="flex w-full justify-center rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
          >
            Apple
          </button>
        </div>

        <div className="text-sm text-center">
            <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Already have an account? Sign in
            </Link>
          </div>
      </div>

      {showAddPasswordModal && (
        <AddPasswordModal
          email={modalEmail}
          onClose={() => setShowAddPasswordModal(false)}
        />
      )}
    </div>
  );
}
