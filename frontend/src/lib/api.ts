import { User } from 'firebase/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ============================================================================
// Types
// ============================================================================

export type SupportedProvider = 'google' | 'facebook' | 'microsoft';

export interface AuthResponse {
  success: boolean;
  user?: {
    id?: string;
    email?: string;
    name?: string;
    firebaseUid: string;
    providers?: string[];
    isNew?: boolean;
  };
  error?: string;
}

export interface SocialAuthPreflightResponse {
  success: boolean;
  action: 'signin' | 'link';
  customToken?: string;
  existingUid?: string;
  email?: string;
  existingProviders?: string[];
  message?: string;
  error?: string;
}

// ============================================================================
// Helper
// ============================================================================

async function authRequest(
  endpoint: string,
  user: User,
  body?: Record<string, any>
): Promise<AuthResponse> {
  const token = await user.getIdToken();

  try {
    const res = await fetch(`${API_URL}/api/auth/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body || {}),
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.error || `Failed to ${endpoint}` };
    }

    return data;
  } catch (error: any) {
    console.error(`[api] ${endpoint} error:`, error);
    return { success: false, error: error.message || 'Network error' };
  }
}

// ============================================================================
// Auth Endpoints
// ============================================================================

/**
 * Login - verify token and sync user to database
 */
export async function login(user: User, name?: string): Promise<AuthResponse> {
  return authRequest('login', user, { name: name || user.displayName || user.email?.split('@')[0] });
}

/**
 * Register - verify token and create user in database
 */
export async function register(user: User, name?: string): Promise<AuthResponse> {
  return authRequest('register', user, { name: name || user.displayName || user.email?.split('@')[0] });
}

/**
 * @deprecated Use login() or register() instead
 * Kept for backward compatibility during migration
 */
export async function syncUser(user: User): Promise<AuthResponse> {
  return login(user);
}

// ============================================================================
// Social Auth
// ============================================================================

/**
 * Social auth preflight check - verifies token and checks for conflicts
 */
export async function socialAuthPreflight(
  provider: SupportedProvider,
  accessToken: string
): Promise<SocialAuthPreflightResponse> {
  try {
    const res = await fetch(`${API_URL}/api/auth/social/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, accessToken }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        action: 'signin',
        error: data.error || 'Failed to verify social login'
      };
    }

    return data;
  } catch (error: any) {
    return {
      success: false,
      action: 'signin',
      error: error.message || 'Network error'
    };
  }
}
