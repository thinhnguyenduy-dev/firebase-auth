import { auth } from '../config/firebase';
import { UserRecord } from 'firebase-admin/auth';
import { getEmailFromUser, findUserByEmail, getAccountType } from './userSearchService';

// ============================================================================
// Types
// ============================================================================

export interface LinkResult {
  success: boolean;
  linked: boolean;
  customToken?: string;
  message: string;
  needsVerification?: boolean;
  providers?: string[];
  email?: string;
}

type LinkType = 'social-into-password' | 'social-into-social';

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if the current user needs to be linked with an existing account.
 * 
 * Supports all link scenarios:
 * - CASE 1: Social → Password - Social account links INTO password account
 * - CASE 2: Password → Social - Requires email verification first (security)
 * - CASE 3: Social → Social - Newer social links INTO older social
 * 
 * Always results in a single linked account.
 */
export async function checkAndLinkAccounts(currentUserUid: string): Promise<LinkResult> {
  try {
    console.log(`[checkAndLinkAccounts] Checking UID: ${currentUserUid}`);
    const currentUser = await auth.getUser(currentUserUid);
    
    const email = getEmailFromUser(currentUser);
    
    console.log(`[checkAndLinkAccounts] User email: ${email}`);
    console.log(`[checkAndLinkAccounts] User providers:`, currentUser.providerData.map(p => p.providerId));

    if (!email) {
      console.log(`[checkAndLinkAccounts] No email found for user ${currentUserUid}`);
      return { success: true, linked: false, message: 'No email to check for link' };
    }

    const { hasPassword: currentHasPassword, hasSocial: currentHasSocial } = getAccountType(currentUser);
    console.log(`[checkAndLinkAccounts] Current has password: ${currentHasPassword}, has social: ${currentHasSocial}`);

    // Find OTHER accounts with the same email
    const duplicateAccount = await findUserByEmail(email, currentUserUid);
    
    if (!duplicateAccount) {
      return { success: true, linked: false, message: 'No other account found to link with' };
    }

    const { hasPassword: targetHasPassword, hasSocial: targetHasSocial } = getAccountType(duplicateAccount);
    console.log(`[checkAndLinkAccounts] Found other account ${duplicateAccount.uid} - password: ${targetHasPassword}, social: ${targetHasSocial}`);

    // CASE 1: Current is social-only, target has password
    if (!currentHasPassword && targetHasPassword) {
      return await linkAccounts(currentUserUid, duplicateAccount.uid, currentUser, 'social-into-password');
    }
    
    // CASE 2: Current has password, target is social-only (requires verification)
    if (currentHasPassword && !targetHasPassword && targetHasSocial) {
      return await handlePasswordToSocialLink(currentUserUid, duplicateAccount, email);
    }

    // CASE 3: Both are social-only
    if (!currentHasPassword && currentHasSocial && !targetHasPassword && targetHasSocial) {
      return await linkAccounts(currentUserUid, duplicateAccount.uid, currentUser, 'social-into-social');
    }

    return { success: true, linked: false, message: 'No link scenario matched' };

  } catch (error: any) {
    console.error('Error in checkAndLinkAccounts:', error);
    return { success: false, linked: false, message: error.message || 'Failed to check/link accounts' };
  }
}

// ============================================================================
// Private Helper Functions
// ============================================================================

/**
 * Handle password→social link case (requires email verification)
 */
async function handlePasswordToSocialLink(
  passwordUid: string,
  socialUser: UserRecord,
  email: string
): Promise<LinkResult> {
  const socialProviders = socialUser.providerData
    .filter(p => p.providerId !== 'password')
    .map(p => p.providerId);
  
  console.log(`[checkAndLinkAccounts] Password→Social link detected. Requires verification.`);
  console.log(`[checkAndLinkAccounts] Social providers: ${socialProviders.join(', ')}`);
  
  // Delete the newly created password account (user must verify email first)
  await auth.deleteUser(passwordUid);
  console.log(`Deleted password account ${passwordUid} - user must verify email first`);
  
  return {
    success: true,
    linked: false,
    needsVerification: true,
    providers: socialProviders,
    email: email,
    message: `This email is already registered with ${socialProviders.join(', ')}. Please verify your email to add a password.`,
  };
}

/**
 * Link a source account into a target account.
 * - Deletes the source account
 * - Links source's providers to target account
 * - Returns a custom token for the target account
 */
async function linkAccounts(
  sourceUid: string,
  targetUid: string,
  sourceUser: UserRecord,
  linkType: LinkType
): Promise<LinkResult> {
  const targetLabel = linkType === 'social-into-password' 
    ? 'password account' 
    : 'older social account';
  
  console.log(`[link] Account ${sourceUid} INTO ${targetLabel} ${targetUid}`);
  
  const providersToLink = sourceUser.providerData
    .filter(p => p.providerId !== 'password')
    .map(p => ({ providerId: p.providerId, uid: p.uid }));
  
  console.log('Providers to link:', providersToLink);

  // Delete source account first to release provider UIDs
  await auth.deleteUser(sourceUid);
  console.log(`Deleted source account ${sourceUid}`);
  
  // Link providers to target account
  for (const provider of providersToLink) {
    try {
      await auth.updateUser(targetUid, {
        providerToLink: { providerId: provider.providerId, uid: provider.uid },
      });
      console.log(`Linked ${provider.providerId} to ${targetLabel} ${targetUid}`);
    } catch (linkErr: any) {
      console.error(`Failed to link ${provider.providerId}:`, linkErr.message);
    }
  }
  
  const customToken = await auth.createCustomToken(targetUid);
  const message = linkType === 'social-into-password'
    ? 'Social account linked into password account'
    : 'Social accounts linked';
    
  return { success: true, linked: true, customToken, message };
}
