'use client';

import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { syncUser } from '@/lib/api';
import { useSocialAuth } from '@/hooks/useSocialAuth';
import AuthFormContainer from '@/components/AuthFormContainer';
import SocialLoginButtons from '@/components/SocialLoginButtons';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();
  
  const {
    loading,
    error,
    statusMessage,
    setError,
    setLoading,
    handleSocialLogin,
    initGoogleClient,
  } = useSocialAuth();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await syncUser(result.user);
      router.push('/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Email already in use. Please sign in instead.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormContainer
      title="Create Account"
      subtitle="Join us and get started today"
      iconGradient="from-emerald-500 to-teal-600"
      icon={
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      }
      error={error}
      statusMessage={statusMessage}
      onGoogleClientLoad={initGoogleClient}
    >
      <form className="space-y-5" onSubmit={handleRegister}>
        <div className="space-y-4">
          <input
            type="email"
            required
            className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent transition-all duration-200"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent transition-all duration-200"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-transparent text-white/40">Or continue with</span>
        </div>
      </div>

      <SocialLoginButtons onSocialLogin={handleSocialLogin} loading={loading} />

      <p className="text-center text-white/60">
        Already have an account?{' '}
        <Link href="/" className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors">
          Sign in
        </Link>
      </p>
    </AuthFormContainer>
  );
}
