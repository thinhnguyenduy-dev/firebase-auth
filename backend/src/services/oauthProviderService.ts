/**
 * OAuth Provider Service
 *
 * Handles verification of OAuth access tokens for different providers.
 * Each provider has a different API endpoint for token verification.
 */

export interface OAuthUserInfo {
  email: string;
  emailVerified: boolean;
  providerId: string;
  name?: string;
  picture?: string;
}

export type SupportedProvider = 'google' | 'facebook' | 'microsoft';

/**
 * Verify Google Access Token and extract user info
 */
export async function verifyGoogleToken(accessToken: string): Promise<OAuthUserInfo> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Google token verification failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.email) {
    throw new Error('No email found in Google account');
  }

  return {
    email: data.email,
    emailVerified: data.email_verified ?? false,
    providerId: 'google.com',
    name: data.name,
    picture: data.picture
  };
}

/**
 * Verify Facebook Access Token and extract user info
 */
export async function verifyFacebookToken(accessToken: string): Promise<OAuthUserInfo> {
  const response = await fetch(
    `https://graph.facebook.com/me?fields=id,email,name,picture&access_token=${accessToken}`
  );

  if (!response.ok) {
    throw new Error(`Facebook token verification failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.email) {
    throw new Error('No email permission granted for Facebook account. Please grant email access.');
  }

  return {
    email: data.email,
    emailVerified: true,
    providerId: 'facebook.com',
    name: data.name,
    picture: data.picture?.data?.url
  };
}

/**
 * Verify Microsoft Access Token and extract user info
 */
export async function verifyMicrosoftToken(accessToken: string): Promise<OAuthUserInfo> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Microsoft token verification failed: ${response.statusText}`);
  }

  const data = await response.json();

  // Microsoft Graph API returns email in 'mail' or 'userPrincipalName'
  const email = data.mail || data.userPrincipalName;

  if (!email) {
    throw new Error('No email found in Microsoft account');
  }

  return {
    email: email,
    emailVerified: true,
    providerId: 'microsoft.com',
    name: data.displayName,
    picture: undefined
  };
}

/**
 * Unified token verification dispatcher
 */
export async function verifyOAuthToken(
  provider: SupportedProvider,
  accessToken: string
): Promise<OAuthUserInfo> {
  switch (provider) {
    case 'google':
      return verifyGoogleToken(accessToken);
    case 'facebook':
      return verifyFacebookToken(accessToken);
    case 'microsoft':
      return verifyMicrosoftToken(accessToken);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
