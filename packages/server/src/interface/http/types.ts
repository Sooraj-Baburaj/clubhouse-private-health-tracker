import type { Role } from '@clubhouse/contracts';
import type { Container } from '../../container';

export interface AuthUser {
  id: string;
  teamId: string;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
  mustChangePassword: boolean;
  timezone: string;
  teamTimezone: string;
  totpEnabled: boolean;
  avatarImageId: string | null;
}

export interface AuthSession {
  id: string;
  createdAt: Date;
  adminLastActiveAt: Date | null;
  mfaVerifiedAt: Date | null;
}

export interface AuthState {
  user: AuthUser;
  session: AuthSession;
  mfaPending: boolean;
}

export type AppEnv = {
  Variables: {
    c: Container;
    auth: AuthState | null;
    requestId: string;
    ip: string;
    userAgent: string;
  };
};
