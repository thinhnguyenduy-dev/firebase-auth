import { PrismaClient } from '@prisma/client';
import { auth } from '../config/firebase';
import { getEmailFromUser } from './userSearchService';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Sync user data to database.
 * Handles cases where email might be missing or accounts linked.
 */
export async function syncUserToDatabase(uid: string, email: string | undefined, name?: string) {
  // Email might be missing for social logins with "Create multiple accounts" setting
  let userEmail = email;
  if (!userEmail) {
    try {
      const firebaseUser = await auth.getUser(uid);
      userEmail = getEmailFromUser(firebaseUser);
    } catch (e: any) {
      logger.error('Could not get user email from Firebase:', e);
    }
  }

  if (!userEmail) {
    logger.warn(`User synced without email: ${uid}`);
    return { message: 'User synced without email', uid };
  }

  // Check if user with this email exists but with different UID (account was linked)
  const existingByEmail = await prisma.user.findUnique({
    where: { email: userEmail },
  });

  if (existingByEmail && existingByEmail.firebaseUid !== uid) {
    // Email exists with different UID - update the UID (account was linked)
    logger.info(`Updating firebaseUid for email ${userEmail}: ${existingByEmail.firebaseUid} -> ${uid}`);
    return await prisma.user.update({
      where: { email: userEmail },
      data: { firebaseUid: uid, name },
    });
  }

  // Normal upsert by firebaseUid
  return await prisma.user.upsert({
    where: { firebaseUid: uid },
    update: { email: userEmail, name },
    create: { firebaseUid: uid, email: userEmail, name },
  });
}
