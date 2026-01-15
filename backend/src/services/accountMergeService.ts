import { auth } from '../config/firebase';

// ============================================================================
// Types
// ============================================================================

interface MergeResult {
  success: boolean;
  merged: boolean;
  customToken?: string;
  message: string;
  needsVerification?: boolean;
  providers?: string[];
  email?: string;
}

type MergeType = 'social-into-password' | 'social-into-social';

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if the current user needs to be merged with an existing account.
 * 
 * Supports all merge scenarios:
 * - CASE 1: Social → Password - Social account merges INTO password account
 * - CASE 2: Password → Social - Requires email verification first (security)
 * - CASE 3: Social → Social - Newer social merges INTO older social
 * 
 * Always results in a single merged account.
 */
export async function checkAndMergeAccounts(currentUserUid: string): Promise<MergeResult> {
  try {
    console.log(`[checkAndMergeAccounts] Checking UID: ${currentUserUid}`);
    const currentUser = await auth.getUser(currentUserUid);
    
    const email = getEmailFromUser(currentUser);
    
    console.log(`[checkAndMergeAccounts] User email: ${email}`);
    console.log(`[checkAndMergeAccounts] User providers:`, currentUser.providerData.map(p => p.providerId));

    if (!email) {
      console.log(`[checkAndMergeAccounts] No email found for user ${currentUserUid}`);
      return { success: true, merged: false, message: 'No email to check for merge' };
    }

    const { hasPassword: currentHasPassword, hasSocial: currentHasSocial } = getAccountType(currentUser);
    console.log(`[checkAndMergeAccounts] Current has password: ${currentHasPassword}, has social: ${currentHasSocial}`);

    // Find OTHER accounts with the same email
    const duplicateAccount = await findAccountByEmail(email, currentUserUid);
    
    if (!duplicateAccount) {
      return { success: true, merged: false, message: 'No other account found to merge with' };
    }

    const { hasPassword: targetHasPassword, hasSocial: targetHasSocial } = getAccountType(duplicateAccount);
    console.log(`[checkAndMergeAccounts] Found other account ${duplicateAccount.uid} - password: ${targetHasPassword}, social: ${targetHasSocial}`);

    // CASE 1: Current is social-only, target has password
    if (!currentHasPassword && targetHasPassword) {
      return await mergeAccounts(currentUserUid, duplicateAccount.uid, currentUser, 'social-into-password');
    }
    
    // CASE 2: Current has password, target is social-only (requires verification)
    if (currentHasPassword && !targetHasPassword && targetHasSocial) {
      return await handlePasswordToSocialMerge(currentUserUid, duplicateAccount, email);
    }

    // CASE 3: Both are social-only
    if (!currentHasPassword && currentHasSocial && !targetHasPassword && targetHasSocial) {
      return await mergeAccounts(currentUserUid, duplicateAccount.uid, currentUser, 'social-into-social');
    }

    return { success: true, merged: false, message: 'No merge scenario matched' };

  } catch (error: any) {
    console.error('Error in checkAndMergeAccounts:', error);
    return { success: false, merged: false, message: error.message || 'Failed to check/merge accounts' };
  }
}

// ============================================================================
// Private Helper Functions
// ============================================================================

/**
 * Get email from user record or providerData
 */
function getEmailFromUser(user: any): string | undefined {
  if (user.email) return user.email;
  
  for (const provider of user.providerData || []) {
    if (provider.email) {
      console.log(`[getEmailFromUser] Got email from provider ${provider.providerId}: ${provider.email}`);
      return provider.email;
    }
  }
  return undefined;
}

/**
 * Determine account type (password vs social)
 */
function getAccountType(user: any): { hasPassword: boolean; hasSocial: boolean } {
  const providers = user.providerData.map((p: any) => p.providerId);
  return {
    hasPassword: providers.includes('password'),
    hasSocial: providers.some((p: string) => p !== 'password'),
  };
}

/**
 * Find another account with the same email (excluding current user)
 */
async function findAccountByEmail(email: string, excludeUid: string): Promise<any | null> {
  const listResult = await auth.listUsers(1000);
  
  for (const user of listResult.users) {
    if (user.uid === excludeUid) continue;
    
    const userEmail = getEmailFromUser(user);
    if (userEmail === email) {
      return user;
    }
  }
  return null;
}

/**
 * Handle password→social merge case (requires email verification)
 */
async function handlePasswordToSocialMerge(
  passwordUid: string,
  socialUser: any,
  email: string
): Promise<MergeResult> {
  const socialProviders = socialUser.providerData
    .filter((p: any) => p.providerId !== 'password')
    .map((p: any) => p.providerId);
  
  console.log(`[checkAndMergeAccounts] Password→Social merge detected. Requires verification.`);
  console.log(`[checkAndMergeAccounts] Social providers: ${socialProviders.join(', ')}`);
  
  // Delete the newly created password account (user must verify email first)
  await auth.deleteUser(passwordUid);
  console.log(`Deleted password account ${passwordUid} - user must verify email first`);
  
  return {
    success: true,
    merged: false,
    needsVerification: true,
    providers: socialProviders,
    email: email,
    message: `This email is already registered with ${socialProviders.join(', ')}. Please verify your email to add a password.`,
  };
}

/**
 * Merge a source account into a target account.
 * - Deletes the source account
 * - Links source's providers to target account
 * - Returns a custom token for the target account
 */
async function mergeAccounts(
  sourceUid: string,
  targetUid: string,
  sourceUser: any,
  mergeType: MergeType
): Promise<MergeResult> {
  const targetLabel = mergeType === 'social-into-password' 
    ? 'password account' 
    : 'older social account';
  
  console.log(`[merge] Account ${sourceUid} INTO ${targetLabel} ${targetUid}`);
  
  const providersToLink = sourceUser.providerData
    .filter((p: any) => p.providerId !== 'password')
    .map((p: any) => ({ providerId: p.providerId, uid: p.uid }));
  
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
  const message = mergeType === 'social-into-password'
    ? 'Social account merged into password account'
    : 'Social accounts merged';
    
  return { success: true, merged: true, customToken, message };
}
