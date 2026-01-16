import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { login, register, socialLoginStart } from '../controllers/authController';

const router = Router();

// ============================================================================
// Auth Endpoints
// ============================================================================

/**
 * POST /api/auth/login
 * Complete login flow - verify token, sync to database
 */
router.post('/login', verifyToken, login);

/**
 * POST /api/auth/register
 * Complete registration flow - verify token, create in database
 */
router.post('/register', verifyToken, register);

/**
 * POST /api/auth/social-login-start
 * Pre-flight check for social login - verifies token and checks for conflicts
 */
router.post('/social-login-start', socialLoginStart);

export default router;
