'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [backendData, setBackendData] = useState<any>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const callBackend = async () => {
    if (!user) return;
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
    }
  };

  if (loading || !user) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <button
            onClick={signOut}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Sign Out
          </button>
        </div>
        
        <div className="mb-8">
          <p className="text-lg">Welcome, {user.email}!</p>
          <p className="text-sm text-gray-500">UID: {user.uid}</p>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-xl font-semibold mb-4">Backend Integration Test</h2>
          <button
            onClick={callBackend}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mb-4"
          >
            Call Protected Endpoint
          </button>
          
          {message && <p className="text-sm mb-2">{message}</p>}
          
          {backendData && (
            <div className="bg-gray-50 p-4 rounded border font-mono text-sm overflow-auto">
              <pre>{JSON.stringify(backendData, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
