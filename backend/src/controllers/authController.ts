import { Request, Response } from 'express';
import { syncUserToDatabase } from '../services/userService';
import { AuthRequest } from '../middleware/auth';

// ============================================================================
// Login / Register Controller
// ============================================================================

/**
 * Login endpoint - verify token and sync user to database
 */
export async function login(req: AuthRequest, res: Response) {
  const { uid, email } = req.user!;
  const { name } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const user = await syncUserToDatabase(uid, email, name);
  return res.json({ success: true, user });
}

/**
 * Register endpoint - verify token and create user in database
 */
export async function register(req: AuthRequest, res: Response) {
  const { uid, email } = req.user!;
  const { name } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const user = await syncUserToDatabase(uid, email, name);
  return res.json({ success: true, user });
}


