import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { login, register, socialAuthPreflight } from '../controllers/authController';

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
 * POST /api/auth/social/preflight
 * Pre-authentication check - verifies OAuth token and checks for account conflicts
 */
router.post('/social/preflight', socialAuthPreflight);

export default router;
