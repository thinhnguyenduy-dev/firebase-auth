import { Router } from 'express';
import * as authController from '../controllers/authController';
import { verifyToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { checkLinkSchema, sendVerificationSchema, addPasswordSchema } from '../schemas/authSchemas';

const router = Router();

// ============================================================================
// Account Linking Routes
// ============================================================================

/**
 * Check and link duplicate accounts
 * POST /api/auth/check-link
 */
router.post('/check-link', validate(checkLinkSchema), authController.checkLink);

/**
 * Send verification code for adding password
 * POST /api/auth/send-verification
 */
router.post('/send-verification', validate(sendVerificationSchema), authController.sendVerification);

/**
 * Add password to existing OAuth account
 * POST /api/auth/add-password
 */
router.post('/add-password', validate(addPasswordSchema), authController.addPassword);

// ============================================================================
// Login / Register Routes
// ============================================================================

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
