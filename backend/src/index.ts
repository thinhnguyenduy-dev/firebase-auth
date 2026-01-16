import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import logger from './utils/logger';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Firebase Auth Backend Running');
});

// Auth routes (account linking, login, register)
import authRoutes from './routes/auth';
app.use('/api/auth', authRoutes);

// Protected route example
import { verifyToken, AuthRequest } from './middleware/auth';

app.get('/api/protected', verifyToken, (req: AuthRequest, res) => {
  res.json({ 
    message: 'This is a protected route',
    user: req.user
  });
});

app.use(errorHandler);

app.listen(port, () => {
  logger.info(`Server is running on port ${port}`);
});
