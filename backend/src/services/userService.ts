import { PrismaClient, User } from '@prisma/client';
import { auth } from '../config/firebase';

const prisma = new PrismaClient();

export interface SyncUserData {
  uid: string;
  email?: string;
  name?: string;
}

export interface SyncUserResult {
  user: User;
  emailMissing?: false;
}

export interface SyncUserNoEmailResult {
  message: string;
  uid: string;
  emailMissing: true;
}

/**
 * Get email from Firebase user, checking provider data if necessary
 */
export async function getEmailFromFirebase(uid: string, email?: string): Promise<string | null> {
  if (email) return email;

  try {
    const firebaseUser = await auth.getUser(uid);
    
    if (firebaseUser.email) {
      return firebaseUser.email;
    }

    // Check providerData for email
    for (const provider of firebaseUser.providerData) {
      if (provider.email) {
        console.log(`[userService] Got email from provider ${provider.providerId}: ${provider.email}`);
        return provider.email;
      }
    }
  } catch (e) {
    console.error('[userService] Could not get user email from Firebase:', e);
  }

  return null;
}

/**
 * Sync user to database, handling account merges
 */
export async function syncUserToDatabase(
  data: SyncUserData
): Promise<SyncUserResult | SyncUserNoEmailResult> {
  const { uid, name } = data;
  
  const userEmail = await getEmailFromFirebase(uid, data.email);

  if (!userEmail) {
    return { message: 'User synced without email', uid, emailMissing: true };
  }

  // Check if user with this email exists but with different UID (account merge scenario)
  const existingByEmail = await prisma.user.findUnique({
    where: { email: userEmail },
  });

  if (existingByEmail && existingByEmail.firebaseUid !== uid) {
    // Email exists with different UID - update the UID (account was merged)
    console.log(`[userService] Updating firebaseUid for email ${userEmail}: ${existingByEmail.firebaseUid} -> ${uid}`);
    const user = await prisma.user.update({
      where: { email: userEmail },
      data: { firebaseUid: uid, name },
    });
    return { user };
  }

  // Normal upsert by firebaseUid
  const user = await prisma.user.upsert({
    where: { firebaseUid: uid },
    update: { email: userEmail, name },
    create: { firebaseUid: uid, email: userEmail, name },
  });
  return { user };
}
