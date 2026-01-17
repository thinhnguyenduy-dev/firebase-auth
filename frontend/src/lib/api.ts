import { User } from 'firebase/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ============================================================================
// API Error Handling
// ============================================================================

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Centralized fetch helper with proper error handling.
 * Checks response.ok and throws ApiError for failed requests.
 */
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json();
  
  if (!res.ok) {
    throw new ApiError(res.status, data.message || 'Request failed');
  }
  
  return data;
}

// ============================================================================
// Account Link API
// ============================================================================

export interface CheckLinkResponse {
  success: boolean;
  linked: boolean;
  customToken?: string;
  message: string;
  needsVerification?: boolean;
  providers?: string[];
  email?: string;
}

/**
 * Check and link duplicate accounts.
 */
export async function checkAccountLink(currentUserUid: string): Promise<CheckLinkResponse> {
  return fetchApi<CheckLinkResponse>(`${API_URL}/api/auth/check-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentUserUid }),
  });
}

// ============================================================================
// Login / Register API
// ============================================================================

export interface AuthResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    firebaseUid: string;
    name?: string;
  };
  message?: string;
}

/**
 * Login - sync user to database after Firebase auth
 */
export async function login(user: User): Promise<AuthResponse> {
  const token = await user.getIdToken();
  return fetchApi<AuthResponse>(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: user.displayName || user.email?.split('@')[0],
    }),
  });
}

/**
 * Register - create user in database after Firebase auth
 */
export async function register(user: User): Promise<AuthResponse> {
  const token = await user.getIdToken();
  return fetchApi<AuthResponse>(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: user.displayName || user.email?.split('@')[0],
    }),
  });
}

// ============================================================================
// Add Password to Social Account
// ============================================================================

export async function sendVerificationCode(
  email: string
): Promise<{ success: boolean; message: string }> {
  return fetchApi<{ success: boolean; message: string }>(`${API_URL}/api/auth/send-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function addPasswordToAccount(
  email: string,
  code: string,
  password: string
): Promise<{ success: boolean; message: string }> {
  return fetchApi<{ success: boolean; message: string }>(`${API_URL}/api/auth/add-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, password }),
  });
}

