import { auth } from '../config/firebase';
import { UserRecord } from 'firebase-admin/auth';
import { getEmailFromUser, findUserByEmail, getAccountType } from './userSearchService';
import logger from '../utils/logger';

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
    logger.info('Checking UID for account linking', { uid: currentUserUid });
    const currentUser = await auth.getUser(currentUserUid);
    
    const email = getEmailFromUser(currentUser);
    
    logger.info('User account info', { 
      email, 
      providers: currentUser.providerData.map(p => p.providerId) 
    });

    if (!email) {
      logger.info('No email found for user', { uid: currentUserUid });
      return { success: true, linked: false, message: 'No email to check for link' };
    }

    const { hasPassword: currentHasPassword, hasSocial: currentHasSocial } = getAccountType(currentUser);
    logger.debug('Current account type', { hasPassword: currentHasPassword, hasSocial: currentHasSocial });

    // Find OTHER accounts with the same email
    const duplicateAccount = await findUserByEmail(email, currentUserUid);
    
    if (!duplicateAccount) {
      return { success: true, linked: false, message: 'No other account found to link with' };
    }

    const { hasPassword: targetHasPassword, hasSocial: targetHasSocial } = getAccountType(duplicateAccount);
    logger.info('Found duplicate account', { 
      uid: duplicateAccount.uid, 
      hasPassword: targetHasPassword, 
      hasSocial: targetHasSocial 
    });

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
    logger.error('Error in checkAndLinkAccounts', { error: error.message, stack: error.stack });
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
  
  logger.info('Password→Social link detected, requires verification', { 
    providers: socialProviders 
  });
  
  // Delete the newly created password account (user must verify email first)
  await auth.deleteUser(passwordUid);
  logger.info('Deleted password account for verification flow', { uid: passwordUid });
  
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
  
  logger.info('Linking accounts', { sourceUid, targetUid, targetLabel });
  
  const providersToLink = sourceUser.providerData
    .filter(p => p.providerId !== 'password')
    .map(p => ({ providerId: p.providerId, uid: p.uid }));
  
  logger.debug('Providers to link', { providers: providersToLink });

  // Delete source account first to release provider UIDs
  await auth.deleteUser(sourceUid);
  logger.info('Deleted source account', { uid: sourceUid });
  
  // Link providers to target account
  for (const provider of providersToLink) {
    try {
      await auth.updateUser(targetUid, {
        providerToLink: { providerId: provider.providerId, uid: provider.uid },
      });
      logger.info('Linked provider to target account', { 
        provider: provider.providerId, 
        targetUid 
      });
    } catch (linkErr: any) {
      logger.error('Failed to link provider', { 
        provider: provider.providerId, 
        error: linkErr.message 
      });
    }
  }
  
  const customToken = await auth.createCustomToken(targetUid);
  const message = linkType === 'social-into-password'
    ? 'Social account linked into password account'
    : 'Social accounts linked';
    
  return { success: true, linked: true, customToken, message };
}

