import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const syncUserToDatabase = async (firebaseUid: string, email: string, name?: string) => {
  return await prisma.user.upsert({
    where: { firebaseUid },
    update: {
      email,
      name,
    },
    create: {
      firebaseUid,
      email,
      name,
    },
  });
};
