import { Request, Response } from 'express';
import { auth } from '../config/firebase';
import { checkAndLinkAccounts } from '../services/accountLinkService';
import { generateCode, storeCode, verifyCode } from '../services/verificationStore';
import { sendVerificationCode } from '../services/emailService';
import { findUserByEmail } from '../services/userSearchService';
import { syncUserToDatabase } from '../services/userService';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { CheckLinkRequest, SendVerificationRequest, AddPasswordRequest } from '../schemas/authSchemas'; // Types from schemas if exported, otherwise maintain interfaces or use z.infer
// Note: We need to export types from schemas or redefine them. 
// For now, I will trust the Zod middleware to validate body, so I can cast body.

// Redefining types based on what was there, but strictly typed now
interface CheckLinkBody {
    currentUserUid: string;
}

interface SendVerificationBody {
    email: string;
}

interface AddPasswordBody {
    email: string;
    code: string;
    password: string;
}

// ============================================================================
// Account Link Controller
// ============================================================================

/**
 * Check and link duplicate accounts.
 */
export async function checkLink(req: Request, res: Response) {
  const { currentUserUid } = req.body as CheckLinkBody;

  const result = await checkAndLinkAccounts(currentUserUid);
  return res.json(result);
}

// ============================================================================
// Add Password Controller
// ============================================================================

/**
 * Send verification code for adding password to existing OAuth account
 */
export async function sendVerification(req: Request, res: Response) {
  const { email } = req.body as SendVerificationBody;

  const existingUser = await findUserByEmail(email);

  if (!existingUser) {
    throw new AppError('No account found with this email', 404);
  }

  const hasPassword = existingUser.providerData.some(p => p.providerId === 'password');
  if (hasPassword) {
    throw new AppError('Account already has a password. Please use login instead.', 409);
  }

  const code = generateCode();
  storeCode(email, code);
  await sendVerificationCode(email, code);

  return res.json({
    success: true,
    message: 'Verification code sent'
  });
}

/**
 * Add password to existing OAuth account after verification
 */
export async function addPassword(req: Request, res: Response) {
  const { email, code, password } = req.body as AddPasswordBody;

  const isValid = verifyCode(email, code);
  if (!isValid) {
    throw new AppError('Invalid or expired verification code', 401);
  }

  const existingUser = await findUserByEmail(email);

  if (!existingUser) {
    throw new AppError('No account found with this email', 404);
  }

  // With "Create multiple accounts" setting, social account may have email only in providerData
  // We need to set email at account level for signInWithEmailAndPassword to work
  await auth.updateUser(existingUser.uid, {
    email: email,  // Set email at account level (required for email/password login)
    password: password
  });

  return res.json({
    success: true,
    message: 'Password added successfully'
  });
}

// ============================================================================
// Login / Register Controller
// ============================================================================

/**
 * Login endpoint - verify token and sync user to database
 */
export async function login(req: AuthRequest, res: Response) {
  const { uid, email } = req.user!;
  const { name } = req.body;

  const user = await syncUserToDatabase(uid, email, name);
  return res.json({ success: true, user });
}

/**
 * Register endpoint - verify token and create user in database
 */
export async function register(req: AuthRequest, res: Response) {
  const { uid, email } = req.user!;
  const { name } = req.body;

  const user = await syncUserToDatabase(uid, email, name);
  return res.json({ success: true, user });
}


