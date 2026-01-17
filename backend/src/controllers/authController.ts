import { Request, Response } from 'express';
import { auth } from '../config/firebase';
import { checkAndLinkAccounts, LinkResult } from '../services/accountLinkService';
import { generateCode, storeCode, verifyCode } from '../services/verificationStore';
import { sendVerificationCode } from '../services/emailService';
import { findUserByEmail } from '../services/userSearchService';
import { syncUserToDatabase } from '../services/userService';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { CheckLinkRequest, SendVerificationRequest, AddPasswordRequest } from '../schemas/authSchemas';

// =============================================================================
// Response Types
// =============================================================================

interface SuccessResponse {
  success: true;
  message: string;
}

interface UserResponse {
  success: true;
  user: {
    id: string;
    email: string;
    firebaseUid: string;
    name: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | {
    message: string;
    uid: string;
  };
}

// =============================================================================
// Account Linking
// =============================================================================

/**
 * Check if current user needs to be linked with an existing account.
 *
 * @param req - Request containing currentUserUid in body
 * @param res - Response with link result
 * @returns LinkResult with success status, linked flag, and optional customToken
 */
export async function checkLink(req: Request, res: Response<LinkResult>): Promise<Response> {
  const { currentUserUid } = req.body as CheckLinkRequest;
  const result = await checkAndLinkAccounts(currentUserUid);
  return res.json(result);
}

// =============================================================================
// Password Management
// =============================================================================

/**
 * Send verification code for adding password to existing OAuth account.
 *
 * @param req - Request containing email in body
 * @param res - Response with success status
 * @throws {AppError} 404 - No account found with this email
 * @throws {AppError} 409 - Account already has a password
 */
export async function sendVerification(
  req: Request,
  res: Response<SuccessResponse>
): Promise<Response> {
  const { email } = req.body as SendVerificationRequest;

  const existingUser = await findUserByEmail(email);
  if (!existingUser) {
    throw new AppError('No account found with this email', 404);
  }

  const hasPassword = existingUser.providerData.some((p) => p.providerId === 'password');
  if (hasPassword) {
    throw new AppError('Account already has a password. Please use login instead.', 409);
  }

  const code = generateCode();
  storeCode(email, code);
  await sendVerificationCode(email, code);

  return res.json({ success: true, message: 'Verification code sent' });
}

/**
 * Add password to existing OAuth account after email verification.
 *
 * @param req - Request containing email, code, and password in body
 * @param res - Response with success status
 * @throws {AppError} 401 - Invalid or expired verification code
 * @throws {AppError} 404 - No account found with this email
 */
export async function addPassword(
  req: Request,
  res: Response<SuccessResponse>
): Promise<Response> {
  const { email, code, password } = req.body as AddPasswordRequest;

  const isValid = verifyCode(email, code);
  if (!isValid) {
    throw new AppError('Invalid or expired verification code', 401);
  }

  const existingUser = await findUserByEmail(email);
  if (!existingUser) {
    throw new AppError('No account found with this email', 404);
  }

  // With "Create multiple accounts" setting, social account may have email only in providerData
  // Set email at account level for signInWithEmailAndPassword to work
  await auth.updateUser(existingUser.uid, { email, password });

  return res.json({ success: true, message: 'Password added successfully' });
}

// =============================================================================
// Authentication
// =============================================================================

/**
 * Login endpoint - verify token and sync user to database.
 * Called after Firebase client-side authentication is complete.
 *
 * @param req - Authenticated request with user info from token
 * @param res - Response with synced user data
 */
export async function login(req: AuthRequest, res: Response<UserResponse>): Promise<Response> {
  const { uid, email } = req.user!;
  const { name } = req.body;

  const user = await syncUserToDatabase(uid, email, name);
  return res.json({ success: true, user });
}

/**
 * Register endpoint - verify token and create user in database.
 * Called after Firebase client-side registration is complete.
 *
 * @param req - Authenticated request with user info from token
 * @param res - Response with created user data
 */
export async function register(req: AuthRequest, res: Response<UserResponse>): Promise<Response> {
  const { uid, email } = req.user!;
  const { name } = req.body;

  const user = await syncUserToDatabase(uid, email, name);
  return res.json({ success: true, user });
}



