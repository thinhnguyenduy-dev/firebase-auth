'use client';

import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfig) => void;
          prompt: (callback?: (notification: PromptMomentNotification) => void) => void;
          renderButton: (parent: HTMLElement, options: GsiButtonConfig) => void;
          disableAutoSelect: () => void;
          cancel: () => void;
        };
        oauth2: {
          initCodeClient: (config: CodeClientConfig) => CodeClient;
          initTokenClient: (config: TokenClientConfig) => TokenClient;
        };
      };
    };
  }
}

interface GoogleIdConfig {
  client_id: string;
  callback: (response: CredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

interface CredentialResponse {
  credential: string; // JWT ID token
  select_by: string;
  clientId: string;
}

interface PromptMomentNotification {
  isDisplayMoment: () => boolean;
  isDisplayed: () => boolean;
  isNotDisplayed: () => boolean;
  getNotDisplayedReason: () => string;
  isSkippedMoment: () => boolean;
  getSkippedReason: () => string;
  isDismissedMoment: () => boolean;
  getDismissedReason: () => string;
}

interface GsiButtonConfig {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: ErrorResponse) => void;
  prompt?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

interface ErrorResponse {
  type: string;
  message?: string;
}

interface CodeClientConfig {
  client_id: string;
  scope: string;
  callback: (response: CodeResponse) => void;
  error_callback?: (error: ErrorResponse) => void;
}

interface CodeResponse {
  code: string;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface CodeClient {
  requestCode: () => void;
}

interface GoogleSignInButtonProps {
  onCredentialReceived: (idToken: string, accessToken?: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
  useAccessToken?: boolean; // If true, also get access token
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

/**
 * Custom Google Sign-In button using Google Identity Services SDK.
 * This bypasses Firebase's signInWithPopup to give us full control over the OAuth flow.
 */
export default function GoogleSignInButton({
  onCredentialReceived,
  onError,
  disabled = false,
  useAccessToken = true,
}: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const tokenClientRef = useRef<TokenClient | null>(null);
  const pendingIdTokenRef = useRef<string | null>(null);

  // Handle ID token response (from One Tap or Sign In button)
  const handleCredentialResponse = useCallback((response: CredentialResponse) => {
    console.log('Google ID token received');
    
    if (useAccessToken && tokenClientRef.current) {
      // Store the ID token and request access token
      pendingIdTokenRef.current = response.credential;
      tokenClientRef.current.requestAccessToken({ prompt: '' });
    } else {
      // Just use ID token
      onCredentialReceived(response.credential);
    }
  }, [onCredentialReceived, useAccessToken]);

  // Handle access token response
  const handleTokenResponse = useCallback((response: TokenResponse) => {
    if (response.error) {
      console.error('Token error:', response.error);
      onError(response.error_description || response.error);
      return;
    }

    console.log('Google access token received');
    const idToken = pendingIdTokenRef.current;
    pendingIdTokenRef.current = null;
    
    if (idToken) {
      onCredentialReceived(idToken, response.access_token);
    } else {
      // No ID token available, just pass access token
      onCredentialReceived('', response.access_token);
    }
  }, [onCredentialReceived, onError]);

  // Handle token errors
  const handleTokenError = useCallback((error: ErrorResponse) => {
    console.error('Token error:', error);
    pendingIdTokenRef.current = null;
    
    if (error.type === 'popup_closed') {
      onError('Sign-in was cancelled');
    } else {
      onError(error.message || 'Failed to get access token');
    }
  }, [onError]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      console.error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set');
      return;
    }

    // Check if script is already loaded
    if (window.google?.accounts) {
      initializeGoogle();
      return;
    }

    // Load Google Identity Services script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    script.onerror = () => onError('Failed to load Google Sign-In');
    document.body.appendChild(script);

    function initializeGoogle() {
      if (!window.google?.accounts) {
        onError('Google Sign-In not available');
        return;
      }

      // Initialize for ID token (via button click)
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Initialize token client for access token
      if (useAccessToken) {
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'email profile',
          callback: handleTokenResponse,
          error_callback: handleTokenError,
        });
      }

      // Render the button
      if (buttonRef.current) {
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 280,
        });
      }
    }

    return () => {
      // Cleanup
      window.google?.accounts?.id?.cancel();
    };
  }, [handleCredentialResponse, handleTokenResponse, handleTokenError, onError, useAccessToken]);

  // If disabled, overlay a disabled state
  if (disabled) {
    return (
      <div className="relative">
        <div ref={buttonRef} className="opacity-50 pointer-events-none" />
        <div className="absolute inset-0 cursor-not-allowed" />
      </div>
    );
  }

  return <div ref={buttonRef} />;
}

/**
 * Custom hook for programmatic Google sign-in (without rendered button)
 */
export function useGoogleSignIn() {
  const tokenClientRef = useRef<TokenClient | null>(null);
  const callbackRef = useRef<((accessToken: string) => void) | null>(null);
  const errorCallbackRef = useRef<((error: string) => void) | null>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || typeof window === 'undefined') {
      return;
    }

    function initTokenClient() {
      if (!window.google?.accounts?.oauth2) return;

      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile openid',
        callback: (response: TokenResponse) => {
          if (response.error) {
            errorCallbackRef.current?.(response.error_description || response.error);
          } else {
            callbackRef.current?.(response.access_token);
          }
        },
        error_callback: (error: ErrorResponse) => {
          if (error.type === 'popup_closed') {
            errorCallbackRef.current?.('Sign-in was cancelled');
          } else {
            errorCallbackRef.current?.(error.message || 'Sign-in failed');
          }
        },
      });
    }

    // Check if already loaded
    if (window.google?.accounts?.oauth2) {
      initTokenClient();
      return;
    }

    // Load script if not already present
    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', initTokenClient);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initTokenClient;
    document.body.appendChild(script);
  }, []);

  const signIn = useCallback((
    onSuccess: (accessToken: string) => void,
    onError: (error: string) => void
  ) => {
    callbackRef.current = onSuccess;
    errorCallbackRef.current = onError;

    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
    } else {
      onError('Google Sign-In not initialized. Please try again.');
    }
  }, []);

  return { signIn };
}
