'use client';

import React, { useState } from 'react';
import { User, unlink } from 'firebase/auth';
import { 
  completeSocialAuthFlow, 
  SocialAuthResult 
} from '@/lib/socialAuth';
import { useRouter } from 'next/navigation';

interface LinkedAccountsCardProps {
  user: User;
}

type ProviderType = 'google' | 'facebook' | 'microsoft' | 'apple';

interface ProviderConfig {
  id: ProviderType;
  name: string;
  icon: JSX.Element;
  color: string;
  bgColor: string;
  borderColor: string;
}

export default function LinkedAccountsCard({ user }: LinkedAccountsCardProps) {
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Helper to check if a provider is linked
  const isLinked = (providerId: string) => {
    return user.providerData.some((p) => p.providerId === providerId);
  };

  const providers: ProviderConfig[] = [
    {
      id: 'google',
      name: 'Google',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      ),
      color: 'text-gray-200',
      bgColor: 'bg-white/5',
      borderColor: 'border-white/10',
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: (
        <svg className="w-5 h-5 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
          <path
            d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.791-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
          />
        </svg>
      ),
      color: 'text-[#1877F2]',
      bgColor: 'bg-[#1877F2]/10',
      borderColor: 'border-[#1877F2]/20',
    },
    {
      id: 'microsoft',
      name: 'Microsoft',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 23 23">
          <path fill="#f35325" d="M1 1h10v10H1z"/>
          <path fill="#81bc06" d="M12 1h10v10H12z"/>
          <path fill="#05a6f0" d="M1 12h10v10H1z"/>
          <path fill="#ffba08" d="M12 12h10v10H12z"/>
        </svg>
      ),
      color: 'text-gray-200',
      bgColor: 'bg-white/5',
      borderColor: 'border-white/10',
    },
    {
      id: 'apple',
      name: 'Apple',
      icon: (
        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.05 20.28c-.98.95-2.05.88-3.08.38-1.09-.52-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.48C2.7 15.25 3.51 7.59 10.15 7.59c1.64 0 2.6.48 3.5.48 1.05 0 1.96-.52 3.82-.52 1.39.05 2.58.57 3.35 1.62-3.1 1.76-2.54 5.28.38 6.57-.62 1.81-1.48 3.2-2.15 4.54zM12.03 7.25c-.24-2.2 1.57-4.14 3.71-4.24.29 2.43-2.38 4.38-3.71 4.24z" />
        </svg>
      ),
      color: 'text-white',
      bgColor: 'bg-white/10',
      borderColor: 'border-white/20',
    }
  ];

  const handleLink = async (provider: ProviderType) => {
    setError(null);
    setSuccessMsg(null);
    setLoadingProvider(provider);

    try {
      const result = await completeSocialAuthFlow(provider, (msg) => {
        // Optional status updates to UI could go here
        console.log(msg);
      });

      if (result.success) {
        setSuccessMsg(`Successfully linked ${provider}!`);
        await user.reload(); // Reload user to update providerData immediately in UI
        router.refresh(); 
      } else {
        setError(result.error || 'Failed to link account');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleUnlink = async (providerConfigId: ProviderType) => {
    setError(null);
    setSuccessMsg(null);
    setLoadingProvider(providerConfigId);

    try {
      // Find the correct providerId based on our internal ID
      const targetProviderId = getProviderId({ id: providerConfigId } as ProviderConfig);
      
      // Find the provider object in user.providerData
      const providerData = user.providerData.find(p => p.providerId === targetProviderId);
      
      if (!providerData) {
        throw new Error('Provider not linked');
      }

      // Prevent unlinking if it's the only provider
      if (user.providerData.length === 1) {
        throw new Error('You cannot unlink your only sign-in method.');
      }

      await unlink(user, targetProviderId);
      await user.reload(); // Reload user to update providerData immediately in UI
      
      setSuccessMsg(`Successfully unlinked ${providerConfigId}`);
      router.refresh();
      
    } catch (err: any) {
      console.error('Unlink error:', err);
      setError(err.message || 'Failed to unlink account');
    } finally {
      setLoadingProvider(null);
    }
  };

  // Map firebase provider IDs to our internal IDs
  const getProviderId = (p: ProviderConfig) => {
    if (p.id === 'google') return 'google.com';
    if (p.id === 'facebook') return 'facebook.com';
    if (p.id === 'microsoft') return 'microsoft.com';
    if (p.id === 'apple') return 'apple.com';
    return '';
  };

  return (
    <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center shadow-lg">
          <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Linked Accounts</h2>
          <p className="text-white/60 text-sm">Manage your connected social login providers</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm text-emerald-400">{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {providers.map((provider) => {
          const linked = isLinked(getProviderId(provider));
          const isLoading = loadingProvider === provider.id;

          return (
            <div 
              key={provider.id}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
                linked 
                  ? 'bg-emerald-500/5 border-emerald-500/20' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${provider.bgColor} border ${provider.borderColor} flex items-center justify-center`}>
                  {provider.icon}
                </div>
                <div>
                  <h3 className="text-white font-medium">{provider.name}</h3>
                  <p className={`text-sm ${linked ? 'text-emerald-400' : 'text-white/40'}`}>
                    {linked ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </div>

              {linked ? (
                <button
                  onClick={() => handleUnlink(provider.id)}
                  disabled={isLoading || !!loadingProvider}
                  className={`px-4 py-2 text-sm transition-colors ${
                      isLoading ? 'text-white/40' : 'text-white/40 hover:text-red-400'
                  }`}
                  title={isLoading ? 'Disconnecting...' : 'Unlink account'}
                >
                  {isLoading ? 'Disconnecting...' : 'Disconnect'}
                </button>
              ) : (
                <button
                  onClick={() => handleLink(provider.id)}
                  disabled={isLoading || !!loadingProvider}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isLoading 
                      ? 'bg-white/10 text-white/40 cursor-wait'
                      : 'bg-white text-slate-900 hover:bg-indigo-50 active:bg-indigo-100'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isLoading ? 'Connecting...' : 'Connect'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
