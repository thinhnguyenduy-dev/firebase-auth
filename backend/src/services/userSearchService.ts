import { auth } from '../config/firebase';
import { UserRecord } from 'firebase-admin/auth';

/**
 * Get email from user record, checking both user.email and providerData.
 * With "Create multiple accounts" Firebase setting, email is often only in providerData.
 */
export function getEmailFromUser(user: UserRecord): string | undefined {
  if (user.email) return user.email;
  
  for (const provider of user.providerData || []) {
    if (provider.email) {
      return provider.email;
    }
  }
  return undefined;
}

/**
 * Find a Firebase user by email, checking both user.email and providerData.
 * Works with "Create multiple accounts" Firebase setting where emails may only be in providerData.
 * 
 * @param email - Email address to search for
 * @param excludeUid - Optional UID to exclude from search (useful when finding duplicates)
 * @returns The user record if found, null otherwise
 */
export async function findUserByEmail(
  email: string,
  excludeUid?: string
): Promise<UserRecord | null> {
  // First try the standard lookup
  try {
    const user = await auth.getUserByEmail(email);
    if (!excludeUid || user.uid !== excludeUid) {
      return user;
    }
  } catch (e: any) {
    if (e.code !== 'auth/user-not-found') {
      throw e;
    }
  }

  // With "Create multiple accounts" setting, email might only be in providerData
  // Need to search all users
  const listResult = await auth.listUsers(1000);
  
  for (const user of listResult.users) {
    if (excludeUid && user.uid === excludeUid) continue;
    
    const userEmail = getEmailFromUser(user);
    if (userEmail === email) {
      return user;
    }
  }
  
  return null;
}

/**
 * Determine account type based on providers
 */
export function getAccountType(user: UserRecord): { hasPassword: boolean; hasSocial: boolean } {
  const providers = user.providerData.map(p => p.providerId);
  return {
    hasPassword: providers.includes('password'),
    hasSocial: providers.some(p => p !== 'password'),
  };
}
