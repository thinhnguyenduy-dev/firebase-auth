import { Request, Response } from 'express';
import { auth } from '../config/firebase';
import { PrismaClient } from '@prisma/client';
import { checkAndLinkAccounts } from '../services/accountLinkService';
import { generateCode, storeCode, verifyCode } from '../services/verificationStore';
import { sendVerificationCode } from '../services/emailService';
import { findUserByEmail, getEmailFromUser } from '../services/userSearchService';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// ============================================================================
// Types
// ============================================================================

interface CheckLinkRequest {
  currentUserUid: string;
}

interface SendVerificationRequest {
  email: string;
}

interface AddPasswordRequest {
  email: string;
  code: string;
  password: string;
}

// ============================================================================
// Account Link Controller
// ============================================================================

/**
 * Check and link duplicate accounts.
 * Called after signInWithPopup when using "Create multiple accounts" Firebase setting.
 * 
 * Handles all link scenarios:
 * - Social → Password: Link social into password account
 * - Password → Social: Link social into password account  
 * - Social → Social: Link newer into older account
 */
export async function checkLink(req: Request, res: Response) {
  const { currentUserUid } = req.body as CheckLinkRequest;

  if (!currentUserUid) {
    return res.status(400).json({
      success: false,
      linked: false,
      message: 'Missing required field: currentUserUid'
    });
  }

  try {
    const result = await checkAndLinkAccounts(currentUserUid);
    return res.json(result);
  } catch (error: any) {
    console.error('Error in check-link:', error);
    return res.status(500).json({
      success: false,
      linked: false,
      message: 'Failed to check/link accounts'
    });
  }
}

// ============================================================================
// Add Password Controller
// ============================================================================

/**
 * Send verification code for adding password to existing OAuth account
 */
export async function sendVerification(req: Request, res: Response) {
  const { email } = req.body as SendVerificationRequest;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  try {
    const existingUser = await findUserByEmail(email);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email'
      });
    }

    const hasPassword = existingUser.providerData.some(p => p.providerId === 'password');
    if (hasPassword) {
      return res.status(409).json({
        success: false,
        message: 'Account already has a password. Please use login instead.'
      });
    }

    const code = generateCode();
    storeCode(email, code);
    await sendVerificationCode(email, code);

    return res.json({
      success: true,
      message: 'Verification code sent'
    });
  } catch (error: any) {
    console.error('Error sending verification:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send verification code'
    });
  }
}

/**
 * Add password to existing OAuth account after verification
 */
export async function addPassword(req: Request, res: Response) {
  const { email, code, password } = req.body as AddPasswordRequest;

  if (!email || !code || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email, code, and password are required'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters'
    });
  }

  try {
    const isValid = verifyCode(email, code);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    const existingUser = await findUserByEmail(email);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email'
      });
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
  } catch (error: any) {
    console.error('Error adding password:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add password'
    });
  }
}

// ============================================================================
// Login / Register Controller
// ============================================================================

/**
 * Helper function to sync user data to database
 */
async function syncUserToDatabase(uid: string, email: string | undefined, name?: string) {
  // Email might be missing for social logins with "Create multiple accounts" setting
  let userEmail = email;
  if (!userEmail) {
    try {
      const firebaseUser = await auth.getUser(uid);
      userEmail = getEmailFromUser(firebaseUser);
    } catch (e) {
      console.error('Could not get user email from Firebase:', e);
    }
  }

  if (!userEmail) {
    return { message: 'User synced without email', uid };
  }

  // Check if user with this email exists but with different UID (account was linked)
  const existingByEmail = await prisma.user.findUnique({
    where: { email: userEmail },
  });

  if (existingByEmail && existingByEmail.firebaseUid !== uid) {
    // Email exists with different UID - update the UID (account was linked)
    console.log(`Updating firebaseUid for email ${userEmail}: ${existingByEmail.firebaseUid} -> ${uid}`);
    return await prisma.user.update({
      where: { email: userEmail },
      data: { firebaseUid: uid, name },
    });
  }

  // Normal upsert by firebaseUid
  return await prisma.user.upsert({
    where: { firebaseUid: uid },
    update: { email: userEmail, name },
    create: { firebaseUid: uid, email: userEmail, name },
  });
}

/**
 * Login endpoint - verify token and sync user to database
 */
export async function login(req: AuthRequest, res: Response) {
  const { uid, email } = req.user!;
  const { name } = req.body;

  try {
    const user = await syncUserToDatabase(uid, email, name);
    return res.json({ success: true, user });
  } catch (error) {
    console.error('Error in login:', error);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
}

/**
 * Register endpoint - verify token and create user in database
 */
export async function register(req: AuthRequest, res: Response) {
  const { uid, email } = req.user!;
  const { name } = req.body;

  try {
    const user = await syncUserToDatabase(uid, email, name);
    return res.json({ success: true, user });
  } catch (error) {
    console.error('Error in register:', error);
    return res.status(500).json({ success: false, message: 'Registration failed' });
  }
}

