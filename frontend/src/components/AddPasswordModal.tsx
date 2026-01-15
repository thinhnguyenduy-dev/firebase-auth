'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { sendVerificationCode, addPasswordToAccount, syncUser } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface AddPasswordModalProps {
  email: string;
  onClose: () => void;
  initialPassword?: string;
}

type Step = 'initial' | 'code-sent' | 'success';

export default function AddPasswordModal({ email, onClose, initialPassword = '' }: AddPasswordModalProps) {
  const [step, setStep] = useState<Step>('initial');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState(initialPassword);
  const [confirmPassword, setConfirmPassword] = useState(initialPassword);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSendCode = async () => {
    setError('');
    setLoading(true);

    try {
      const result = await sendVerificationCode(email);
      if (result.success) {
        setStep('code-sent');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const result = await addPasswordToAccount(email, code, password);
      if (result.success) {
        // Sign in with the new password
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await syncUser(userCredential.user);
        router.push('/dashboard');
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900">Add Password to Account</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-gray-600 mb-4">
          An account with <strong>{email}</strong> already exists. You can add a password to sign in with email/password.
        </p>

        {step === 'initial' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              We'll send a verification code to your email to confirm you own this account.
            </p>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleSendCode}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </div>
        )}

        {step === 'code-sent' && (
          <form onSubmit={handleAddPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Verification Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter 6-digit code"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                maxLength={6}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                minLength={6}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                minLength={6}
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('initial')}
                className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Password'}
              </button>
            </div>
            <button
              type="button"
              onClick={handleSendCode}
              disabled={loading}
              className="w-full text-sm text-indigo-600 hover:text-indigo-500"
            >
              Resend code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
