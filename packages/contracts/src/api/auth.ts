import { z } from 'zod';
import type { Role } from '../enums';

export const LoginRequest = z.object({
  login: z.string().trim().min(1, 'Enter your username or email').max(120),
  password: z.string().min(1, 'Enter your password').max(200),
  deviceLabel: z.string().max(80).optional(),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const PASSWORD_MIN = 10;
export const NewPassword = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /[^A-Za-z]/.test(p), 'Mix letters with numbers or symbols');

export const ChangePasswordRequest = z.object({ currentPassword: z.string().min(1).max(200), newPassword: NewPassword });
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

export const TotpCodeRequest = z.object({ code: z.string().trim().regex(/^(\d{6}|[a-z0-9]{4}-[a-z0-9]{4})$/i, 'Enter the 6-digit code') });
export type TotpCodeRequest = z.infer<typeof TotpCodeRequest>;

export const ReauthRequest = z.object({ password: z.string().min(1).max(200), code: z.string().trim().optional() });
export type ReauthRequest = z.infer<typeof ReauthRequest>;

export interface LoginResponse {
  mfaRequired: boolean;
  mustChangePassword: boolean;
  role: Role;
}

export interface SessionDto {
  id: string;
  deviceLabel: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface TotpEnrolResponse {
  otpauthUrl: string;
  secret: string;
}
export interface TotpConfirmResponse {
  recoveryCodes: string[];
}
