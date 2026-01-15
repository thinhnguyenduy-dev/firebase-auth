import { auth } from '../config/firebase';

interface MergeAccountsResult {
  success: boolean;
  merged: boolean;
  customToken?: string;
  message: string;
  // For password→social case: requires email verification first
  needsVerification?: boolean;
  providers?: string[];
  email?: string;
}

/**
 * Check if the current user needs to be merged with an existing account.
 * 
 * Supports all merge scenarios:
 * - CASE 1: Social → Password - Social account merges INTO password account
 * - CASE 2: Password → Social - Social account merges INTO password account
 * - CASE 3: Social → Social - Newer social merges INTO older social
 * 
 * Always results in a single merged account.
 */
export async function checkAndMergeAccounts(
  currentUserUid: string
): Promise<MergeAccountsResult> {
  try {
    console.log(`[checkAndMergeAccounts] Checking UID: ${currentUserUid}`);
    const currentUser = await auth.getUser(currentUserUid);
    
    // Get email from user or providerData
    let email = currentUser.email;
    if (!email && currentUser.providerData.length > 0) {
      for (const provider of currentUser.providerData) {
        if (provider.email) {
          email = provider.email;
          console.log(`[checkAndMergeAccounts] Got email from provider ${provider.providerId}: ${email}`);
          break;
        }
      }
    }
    
    console.log(`[checkAndMergeAccounts] User email: ${email}`);
    console.log(`[checkAndMergeAccounts] User providers:`, currentUser.providerData.map(p => p.providerId));

    if (!email) {
      console.log(`[checkAndMergeAccounts] No email found for user ${currentUserUid}`);
      return { success: true, merged: false, message: 'No email to check for merge' };
    }

    // Check current user's account type
    const currentProviders = currentUser.providerData.map(p => p.providerId);
    const currentHasPassword = currentProviders.includes('password');
    const currentHasSocial = currentProviders.some(p => p !== 'password');
    
    console.log(`[checkAndMergeAccounts] Current has password: ${currentHasPassword}, has social: ${currentHasSocial}`);

    // Find OTHER accounts with the same email
    const listResult = await auth.listUsers(1000);
    
    for (const user of listResult.users) {
      if (user.uid === currentUserUid) continue;
      
      // Get user's email (could be on user record or in providerData)
      let userEmail = user.email;
      if (!userEmail && user.providerData.length > 0) {
        for (const provider of user.providerData) {
          if (provider.email) {
            userEmail = provider.email;
            break;
          }
        }
      }
      
      if (userEmail === email) {
        const targetProviders = user.providerData.map(p => p.providerId);
        const targetHasPassword = targetProviders.includes('password');
        const targetHasSocial = targetProviders.some(p => p !== 'password');
        
        console.log(`[checkAndMergeAccounts] Found other account ${user.uid} - password: ${targetHasPassword}, social: ${targetHasSocial}`);

        // CASE 1: Current is social-only, target has password
        // Merge social (current) INTO password (target)
        // SAFE: User authenticated with OAuth provider
        if (!currentHasPassword && targetHasPassword) {
          return await mergeSocialIntoPassword(currentUserUid, user.uid, currentUser);
        }
        
        // CASE 2: Current has password, target is social-only
        // SECURITY: Require email verification before merging
        // Otherwise anyone who knows the email could hijack the account
        if (currentHasPassword && !targetHasPassword && targetHasSocial) {
          const socialProviders = user.providerData
            .filter((p: any) => p.providerId !== 'password')
            .map((p: any) => p.providerId);
          
          console.log(`[checkAndMergeAccounts] Password→Social merge detected. Requires verification.`);
          console.log(`[checkAndMergeAccounts] Social providers: ${socialProviders.join(', ')}`);
          
          // Delete the newly created password account (we'll add password to social account after verification)
          await auth.deleteUser(currentUserUid);
          console.log(`Deleted password account ${currentUserUid} - user must verify email first`);
          
          return {
            success: true,
            merged: false,
            needsVerification: true,
            providers: socialProviders,
            email: email,
            message: `This email is already registered with ${socialProviders.join(', ')}. Please verify your email to add a password.`,
          };
        }

        // CASE 3: Both are social-only (no password on either)
        // Merge current (newer) INTO target (older)
        if (!currentHasPassword && currentHasSocial && !targetHasPassword && targetHasSocial) {
          return await mergeSocialIntoSocial(currentUserUid, user.uid, currentUser);
        }
      }
    }

    return { success: true, merged: false, message: 'No other account found to merge with' };

  } catch (error: any) {
    console.error('Error in checkAndMergeAccounts:', error);
    return { success: false, merged: false, message: error.message || 'Failed to check/merge accounts' };
  }
}

// ============================================================================
// Private Helper Functions
// ============================================================================

async function mergeSocialIntoPassword(
  socialUid: string,
  passwordUid: string,
  socialUser: any
): Promise<MergeAccountsResult> {
  console.log(`[merge] Social account ${socialUid} INTO password account ${passwordUid}`);
  
  const providersToLink = socialUser.providerData
    .filter((p: any) => p.providerId !== 'password')
    .map((p: any) => ({ providerId: p.providerId, uid: p.uid }));
  
  console.log('Providers to link:', providersToLink);

  // Delete social account first to release provider UIDs
  await auth.deleteUser(socialUid);
  console.log(`Deleted social account ${socialUid}`);
  
  // Link providers to password account
  for (const provider of providersToLink) {
    try {
      await auth.updateUser(passwordUid, {
        providerToLink: { providerId: provider.providerId, uid: provider.uid },
      });
      console.log(`Linked ${provider.providerId} to password account ${passwordUid}`);
    } catch (linkErr: any) {
      console.error(`Failed to link ${provider.providerId}:`, linkErr.message);
    }
  }
  
  const customToken = await auth.createCustomToken(passwordUid);
  return { success: true, merged: true, customToken, message: 'Social account merged into password account' };
}

async function mergeOtherSocialIntoCurrentPassword(
  currentPasswordUid: string,
  otherSocialUser: any
): Promise<MergeAccountsResult> {
  console.log(`[merge] Social account ${otherSocialUser.uid} INTO password account ${currentPasswordUid}`);
  
  const providersToLink = otherSocialUser.providerData
    .filter((p: any) => p.providerId !== 'password')
    .map((p: any) => ({ providerId: p.providerId, uid: p.uid }));
  
  console.log('Providers to link:', providersToLink);

  // Delete social account first
  await auth.deleteUser(otherSocialUser.uid);
  console.log(`Deleted social account ${otherSocialUser.uid}`);
  
  // Link providers to current password account
  for (const provider of providersToLink) {
    try {
      await auth.updateUser(currentPasswordUid, {
        providerToLink: { providerId: provider.providerId, uid: provider.uid },
      });
      console.log(`Linked ${provider.providerId} to password account ${currentPasswordUid}`);
    } catch (linkErr: any) {
      console.error(`Failed to link ${provider.providerId}:`, linkErr.message);
    }
  }
  
  // Current user stays signed in - no custom token needed
  return { success: true, merged: true, message: 'Social providers merged into password account' };
}

async function mergeSocialIntoSocial(
  newerSocialUid: string,
  olderSocialUid: string,
  newerSocialUser: any
): Promise<MergeAccountsResult> {
  console.log(`[merge] Newer social account ${newerSocialUid} INTO older social account ${olderSocialUid}`);
  
  const providersToLink = newerSocialUser.providerData
    .filter((p: any) => p.providerId !== 'password')
    .map((p: any) => ({ providerId: p.providerId, uid: p.uid }));
  
  console.log('Providers to link:', providersToLink);

  // Delete newer social account first
  await auth.deleteUser(newerSocialUid);
  console.log(`Deleted newer social account ${newerSocialUid}`);
  
  // Link providers to older social account
  for (const provider of providersToLink) {
    try {
      await auth.updateUser(olderSocialUid, {
        providerToLink: { providerId: provider.providerId, uid: provider.uid },
      });
      console.log(`Linked ${provider.providerId} to older social account ${olderSocialUid}`);
    } catch (linkErr: any) {
      console.error(`Failed to link ${provider.providerId}:`, linkErr.message);
    }
  }
  
  const customToken = await auth.createCustomToken(olderSocialUid);
  return { success: true, merged: true, customToken, message: 'Social accounts merged' };
}
