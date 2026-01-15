import { auth } from '../config/firebase';
import { verifyProviderToken } from './providerVerifier';

interface SocialAuthResult {
  success: boolean;
  customToken?: string;
  linked: boolean;
  merged: boolean;
  message: string;
  email?: string;
}

/**
 * Handles social authentication with proper provider linking.
 * This prevents Google from overwriting existing password providers.
 */
export async function handleSocialAuth(
  providerId: string,
  accessToken: string,
  idToken?: string
): Promise<SocialAuthResult> {
  const providerInfo = await verifyProviderToken(providerId, accessToken, idToken);
  const email = providerInfo.email;

  if (!email) {
    return {
      success: false,
      linked: false,
      merged: false,
      message: 'Could not retrieve email from OAuth provider',
    };
  }

  let user;
  let linked = false;
  let isNewUser = false;

  try {
    user = await auth.getUserByEmail(email);
    
    const hasPasswordProvider = user.providerData.some(p => p.providerId === 'password');
    const hasOAuthProvider = user.providerData.some(p => p.providerId === providerId);

    if (!hasOAuthProvider) {
      await auth.updateUser(user.uid, {
        providerToLink: {
          providerId: providerId,
          uid: providerInfo.providerUid,
        },
      });
      linked = hasPasswordProvider;
    }

  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      user = await auth.createUser({
        email: email,
        emailVerified: true,
        displayName: providerInfo.displayName,
        photoURL: providerInfo.photoURL,
      });

      await auth.updateUser(user.uid, {
        providerToLink: {
          providerId: providerId,
          uid: providerInfo.providerUid,
        },
      });

      isNewUser = true;
    } else {
      throw error;
    }
  }

  const customToken = await auth.createCustomToken(user.uid);

  return {
    success: true,
    customToken,
    linked,
    merged: false,
    email,
    message: isNewUser
      ? 'Account created successfully'
      : linked
        ? 'OAuth provider linked to existing account (password preserved)'
        : 'Signed in successfully',
  };
}

interface MergeAccountsResult {
  success: boolean;
  merged: boolean;
  customToken?: string;
  message: string;
}

/**
 * Check if the current user needs to be merged with an existing account.
 * Supports BIDIRECTIONAL merging:
 * - Social account → Password account (social merges INTO password)
 * - Password account → Social account (social merges INTO password)
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
      return {
        success: true,
        merged: false,
        message: 'No email to check for merge',
      };
    }

    // Check what type of account the current user has
    const currentProviders = currentUser.providerData.map(p => p.providerId);
    const currentHasPassword = currentProviders.includes('password');
    const currentHasSocial = currentProviders.some(p => p !== 'password');
    
    console.log(`[checkAndMergeAccounts] Current has password: ${currentHasPassword}, has social: ${currentHasSocial}`);

    // Find OTHER accounts with the same email
    const listResult = await auth.listUsers(1000);
    
    for (const user of listResult.users) {
      if (user.email === email && user.uid !== currentUserUid) {
        const targetProviders = user.providerData.map(p => p.providerId);
        const targetHasPassword = targetProviders.includes('password');
        const targetHasSocial = targetProviders.some(p => p !== 'password');
        
        console.log(`[checkAndMergeAccounts] Found other account ${user.uid} - password: ${targetHasPassword}, social: ${targetHasSocial}`);

        // CASE 1: Current is social-only, target has password
        // Merge social (current) INTO password (target)
        if (!currentHasPassword && targetHasPassword) {
          console.log(`[checkAndMergeAccounts] Merging social account ${currentUserUid} INTO password account ${user.uid}`);
          
          const providersToLink = currentUser.providerData
            .filter(p => p.providerId !== 'password')
            .map(p => ({ providerId: p.providerId, uid: p.uid }));
          
          console.log('Providers to link:', providersToLink);

          // Delete social account first to release provider UIDs
          await auth.deleteUser(currentUserUid);
          console.log(`Deleted social account ${currentUserUid}`);
          
          // Link providers to password account
          for (const provider of providersToLink) {
            try {
              await auth.updateUser(user.uid, {
                providerToLink: {
                  providerId: provider.providerId,
                  uid: provider.uid,
                },
              });
              console.log(`Linked ${provider.providerId} to password account ${user.uid}`);
            } catch (linkErr: any) {
              console.error(`Failed to link ${provider.providerId}:`, linkErr.message);
            }
          }
          
          const customToken = await auth.createCustomToken(user.uid);
          return {
            success: true,
            merged: true,
            customToken,
            message: 'Social account merged into password account',
          };
        }
        
        // CASE 2: Current has password, target is social-only
        // Merge social (target) INTO password (current)
        if (currentHasPassword && !targetHasPassword && targetHasSocial) {
          console.log(`[checkAndMergeAccounts] Merging social account ${user.uid} INTO password account ${currentUserUid}`);
          
          const providersToLink = user.providerData
            .filter(p => p.providerId !== 'password')
            .map(p => ({ providerId: p.providerId, uid: p.uid }));
          
          console.log('Providers to link:', providersToLink);

          // Delete social account first to release provider UIDs
          await auth.deleteUser(user.uid);
          console.log(`Deleted social account ${user.uid}`);
          
          // Link providers to password account (current)
          for (const provider of providersToLink) {
            try {
              await auth.updateUser(currentUserUid, {
                providerToLink: {
                  providerId: provider.providerId,
                  uid: provider.uid,
                },
              });
              console.log(`Linked ${provider.providerId} to password account ${currentUserUid}`);
            } catch (linkErr: any) {
              console.error(`Failed to link ${provider.providerId}:`, linkErr.message);
            }
          }
          
          // Current user stays signed in - no custom token needed
          return {
            success: true,
            merged: true,
            message: 'Social providers merged into password account',
          };
        }
      }
    }

    // No merge needed
    return {
      success: true,
      merged: false,
      message: 'No other account found to merge with',
    };

  } catch (error: any) {
    console.error('Error in checkAndMergeAccounts:', error);
    return {
      success: false,
      merged: false,
      message: error.message || 'Failed to check/merge accounts',
    };
  }
}
