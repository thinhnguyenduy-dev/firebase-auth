'use client';

import { useState } from 'react';
import { AuthProvider } from 'firebase/auth';
import { googleProvider, facebookProvider, microsoftProvider, appleProvider } from '@/lib/firebase';

interface LinkAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingEmail: string;
  providers: string[];
  onLink: (provider: AuthProvider) => void;
}

export default function LinkAccountModal({
  isOpen,
  onClose,
  existingEmail,
  providers,
  onLink,
}: LinkAccountModalProps) {
  if (!isOpen) return null;

  const getProviderButton = (providerId: string) => {
    switch (providerId) {
      case 'google.com':
        return (
          <button
            key={providerId}
            onClick={() => onLink(googleProvider)}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded-xl border border-gray-200 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        );
      case 'facebook.com':
        return (
          <button
            key={providerId}
            onClick={() => onLink(facebookProvider)}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Sign in with Facebook
          </button>
        );
      case 'microsoft.com':
        return (
           <button
             key={providerId}
             onClick={() => onLink(microsoftProvider)}
             className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#2F2F2F] hover:bg-[#404040] text-white font-medium rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
           >
             <svg className="w-5 h-5" viewBox="0 0 24 24">
               <path fill="#F25022" d="M1 1h10v10H1z"/>
               <path fill="#00A4EF" d="M1 13h10v10H1z"/>
               <path fill="#7FBA00" d="M13 1h10v10H13z"/>
               <path fill="#FFB900" d="M13 13h10v10H13z"/>
             </svg>
             Sign in with Microsoft
           </button>
        );
      case 'apple.com':
        return (
          <button
            key={providerId}
            onClick={() => onLink(appleProvider)}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-black hover:bg-gray-900 text-white font-medium rounded-xl border border-white/10 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Sign in with Apple
          </button>
        );
      case 'password':
        return (
          <div key={providerId} className="w-full text-center p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-600">
             Please log in with your Email and Password first.
          </div>
        );
      default:
        return null; // Handle other providers or unknown if needed
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in duration-200">
        <div className="text-center space-y-4 mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 text-blue-600 mb-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Account Already Exists</h2>
          <p className="text-gray-600">
            An account with the email <span className="font-semibold text-gray-900">{existingEmail}</span> already exists.
          </p>
          <p className="text-gray-600 text-sm">
            Please sign in with your existing account to link them.
          </p>
        </div>

        <div className="space-y-3">
          {providers.map(provider => getProviderButton(provider))}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-3 px-4 text-gray-500 hover:text-gray-700 font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
