import { z } from 'zod';

export const checkLinkSchema = z.object({
  body: z.object({
    currentUserUid: z.string().min(1, 'currentUserUid is required'),
  }),
});

export type CheckLinkRequest = z.infer<typeof checkLinkSchema>['body'];

export const sendVerificationSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export type SendVerificationRequest = z.infer<typeof sendVerificationSchema>['body'];

export const addPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    code: z.string().min(1, 'Verification code is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

export type AddPasswordRequest = z.infer<typeof addPasswordSchema>['body'];
