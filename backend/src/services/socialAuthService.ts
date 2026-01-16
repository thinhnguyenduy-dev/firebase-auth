import { auth } from '../config/firebase';
import { verifyOAuthToken, SupportedProvider } from './oauthProviderService';

export interface SocialLoginResult {
  action: 'signin' | 'link';
  customToken?: string;
  existingUid?: string;
  email?: string;
  existingProviders?: string[];
  message?: string;
}

// Re-export for convenience
export { SupportedProvider };

/**
 * Unified handler for social login with conflict detection.
 *
 * This function:
 * 1. Verifies the OAuth access token with the respective provider
 * 2. Extracts the email from the provider
 * 3. Checks Firebase for existing users with that email
 * 4. Determines if linking is required or if normal sign-in can proceed
 *
 * Special cases handled:
 * - Gmail addresses with Google: If user has password, Google would normally overwrite it
 * - Any email with existing different provider: Standard Firebase conflict scenario
 */
export async function handleSocialLogin(
  provider: SupportedProvider,
  accessToken: string
): Promise<SocialLoginResult> {
  // 1. Verify token and get user info
  const oauthUserInfo = await verifyOAuthToken(provider, accessToken);
  const email = oauthUserInfo.email.toLowerCase();
  const incomingProviderId = oauthUserInfo.providerId;

  console.log(`[handleSocialLogin] Provider: ${provider}, Email: ${email}`);

  // 2. Check if user exists in Firebase
  let existingUser;
  try {
    existingUser = await auth.getUserByEmail(email);
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      // No existing user - safe to proceed with normal sign-in
      console.log(`[handleSocialLogin] No existing user for ${email} - proceeding with signin`);
      return { action: 'signin', email };
    }
    throw error;
  }

  // 3. Analyze existing providers
  const existingProviders = existingUser.providerData.map(p => p.providerId);
  const hasPassword = existingProviders.includes('password');
  const hasIncomingProvider = existingProviders.includes(incomingProviderId);

  console.log(`[handleSocialLogin] Existing user ${existingUser.uid} has providers: ${existingProviders.join(', ')}`);

  // 4. Determine action based on provider combinations

  // Case A: User already has this provider - normal sign-in
  if (hasIncomingProvider) {
    console.log(`[handleSocialLogin] User already has ${incomingProviderId} - proceeding with signin`);
    return { action: 'signin', email };
  }

  // Case B: User has password provider - MUST link to preserve password
  // This is the critical "Google overwrites password" prevention
  if (hasPassword) {
    console.log(`[handleSocialLogin] User has password provider - returning link action`);
    const customToken = await auth.createCustomToken(existingUser.uid);
    return {
      action: 'link',
      customToken,
      existingUid: existingUser.uid,
      email,
      existingProviders,
      message: `Account exists with email/password. Linking ${provider} account...`
    };
  }

  // Case C: User has different social provider(s) but no password
  // Firebase would normally throw account-exists-with-different-credential
  // We proactively detect and handle this with linking
  console.log(`[handleSocialLogin] User has different social providers - returning link action`);
  const customToken = await auth.createCustomToken(existingUser.uid);
  return {
    action: 'link',
    customToken,
    existingUid: existingUser.uid,
    email,
    existingProviders,
    message: `Account exists with ${existingProviders.join(', ')}. Linking ${provider} account...`
  };
}

