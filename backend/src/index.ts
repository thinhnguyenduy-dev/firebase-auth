import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

app.get('/', (req, res) => {
  res.send('Firebase Auth Monorepo Backend Running');
});

// Auth routes (account linking)
import authRoutes from './routes/auth';
app.use('/api/auth', authRoutes);

// Protected route
import { verifyToken, AuthRequest } from './middleware/auth';

app.get('/api/protected', verifyToken, (req: AuthRequest, res) => {
  res.json({ 
    message: 'This is a protected route',
    user: req.user
  });
});

app.post('/api/users/sync', verifyToken, async (req: AuthRequest, res) => {
  const { uid, email } = req.user!;
  const { name } = req.body;

  // Email might be missing for social logins with "Create multiple accounts" setting
  // In that case, try to get it from Firebase Admin (including providerData)
  let userEmail = email;
  if (!userEmail) {
    try {
      const { auth } = await import('./config/firebase');
      const firebaseUser = await auth.getUser(uid);
      
      // Check user.email first
      userEmail = firebaseUser.email;
      
      // If not found, check providerData
      if (!userEmail && firebaseUser.providerData.length > 0) {
        for (const provider of firebaseUser.providerData) {
          if (provider.email) {
            userEmail = provider.email;
            console.log(`[syncUser] Got email from provider ${provider.providerId}: ${userEmail}`);
            break;
          }
        }
      }
    } catch (e) {
      console.error('Could not get user email from Firebase:', e);
    }
  }

  if (!userEmail) {
    // Still no email - just skip syncing for now
    return res.json({ message: 'User synced without email', uid });
  }

  try {
    // First, check if user with this email exists but with different UID
    // This happens after account merge
    const existingByEmail = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (existingByEmail && existingByEmail.firebaseUid !== uid) {
      // Email exists with different UID - update the UID (account was merged)
      console.log(`Updating firebaseUid for email ${userEmail}: ${existingByEmail.firebaseUid} -> ${uid}`);
      const user = await prisma.user.update({
        where: { email: userEmail },
        data: {
          firebaseUid: uid,
          name,
        },
      });
      return res.json(user);
    }

    // Normal upsert by firebaseUid
    const user = await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: {
        email: userEmail,
        name,
      },
      create: {
        firebaseUid: uid,
        email: userEmail,
        name,
      },
    });
    res.json(user);
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
