import { Router } from 'express';
import * as authController from '../controllers/authController';
import { verifyToken } from '../middleware/auth';

const router = Router();
/**
 * Login - verify token and sync user to database
 * POST /api/auth/login
 */
router.post('/login', verifyToken, authController.login);

/**
 * Register - verify token and create user in database
 * POST /api/auth/register
 */
router.post('/register', verifyToken, authController.register);

export default router;
