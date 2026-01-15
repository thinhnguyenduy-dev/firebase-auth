'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [backendData, setBackendData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const callBackend = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('http://localhost:4000/api/protected', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setBackendData(data);
      setMessage('Successfully fetched protected data!');
    } catch (err) {
      console.error(err);
      setMessage('Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="flex items-center gap-3 text-white">
          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-lg">Loading...</span>
        </div>
      </div>
    );
  }

  // Get user's provider info
  const providers = user.providerData.map(p => p.providerId).join(', ');
  const photoURL = user.photoURL;
  const displayName = user.displayName || user.email?.split('@')[0] || 'User';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 md:p-8">
      {/* Decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative max-w-4xl mx-auto space-y-6">
        {/* Header Card */}
        <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* User Info */}
            <div className="flex items-center gap-4">
              {photoURL ? (
                <img 
                  src={photoURL} 
                  alt={displayName}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-white/20 shadow-lg"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-bold text-white">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">
                  Welcome back, {displayName}!
                </h1>
                <p className="text-white/60 mt-1">{user.email}</p>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={signOut}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-red-500/20 border border-white/20 hover:border-red-500/50 text-white rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Account Status */}
          <div className="backdrop-blur-xl bg-white/10 rounded-2xl shadow-xl border border-white/20 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-white/60 text-sm font-medium">Account Status</span>
            </div>
            <p className="text-2xl font-bold text-white">Active</p>
            <p className="text-emerald-400 text-sm mt-1">Email verified</p>
          </div>

          {/* Login Providers */}
          <div className="backdrop-blur-xl bg-white/10 rounded-2xl shadow-xl border border-white/20 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <span className="text-white/60 text-sm font-medium">Auth Providers</span>
            </div>
            <p className="text-2xl font-bold text-white capitalize">{providers.replace('.com', '')}</p>
            <p className="text-blue-400 text-sm mt-1">Connected</p>
          </div>

          {/* User ID */}
          <div className="backdrop-blur-xl bg-white/10 rounded-2xl shadow-xl border border-white/20 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                </svg>
              </div>
              <span className="text-white/60 text-sm font-medium">User ID</span>
            </div>
            <p className="text-lg font-bold text-white font-mono truncate">{user.uid.substring(0, 12)}...</p>
            <p className="text-purple-400 text-sm mt-1">Unique identifier</p>
          </div>
        </div>

        {/* Backend Integration Card */}
        <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Backend Integration</h2>
              <p className="text-white/60 text-sm">Test the protected API endpoint</p>
            </div>
          </div>

          <button
            onClick={callBackend}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-cyan-500/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {isLoading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Fetching...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Call Protected Endpoint
              </>
            )}
          </button>

          {/* Response Message */}
          {message && (
            <div className={`mt-4 flex items-center gap-2 p-3 rounded-xl ${
              message.includes('Successfully') 
                ? 'bg-emerald-500/10 border border-emerald-500/20' 
                : 'bg-red-500/10 border border-red-500/20'
            }`}>
              {message.includes('Successfully') ? (
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <p className={`text-sm ${message.includes('Successfully') ? 'text-emerald-400' : 'text-red-400'}`}>
                {message}
              </p>
            </div>
          )}

          {/* Backend Data Display */}
          {backendData && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span className="text-white/60 text-sm font-medium">API Response</span>
              </div>
              <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-xl p-4 overflow-x-auto">
                <pre className="text-sm text-emerald-400 font-mono whitespace-pre-wrap">
                  {JSON.stringify(backendData, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-white/30 text-sm py-4">
          Firebase Authentication Demo • {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
