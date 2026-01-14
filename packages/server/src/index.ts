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

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const user = await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: {
        email,
        name,
      },
      create: {
        firebaseUid: uid,
        email,
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
