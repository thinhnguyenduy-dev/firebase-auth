import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { syncUser } from '../controllers/userController';

const router = Router();

/**
 * POST /api/users/sync
 * Sync authenticated user to database
 */
router.post('/sync', verifyToken, syncUser);

export default router;
