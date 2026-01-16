import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { syncUserToDatabase } from '../services/userService';

/**
 * POST /api/users/sync
 * Sync authenticated user to database
 */
export async function syncUser(req: AuthRequest, res: Response) {
  const { uid, email } = req.user!;
  const { name } = req.body;

  try {
    const result = await syncUserToDatabase({ uid, email, name });
    res.json(result);
  } catch (error) {
    console.error('[userController] Error syncing user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
