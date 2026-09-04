import type {
  AuthSession,
  ChangePasswordCredentials,
  LoginCredentials,
  RegisterCredentials,
  User,
} from '@/types/auth';
import { apiFetch, setAccessToken } from '@/api/client';

interface LoginResponse {
  user: User;
  token: {
    accessToken: string;
    expiresAt: string;
  };
}

interface ChangePasswordResponse {
  token: {
    accessToken: string;
    expiresAt: string;
  };
}

function toSession(response: LoginResponse): AuthSession {
  return {
    user: response.user,
    token: {
      accessToken: response.token.accessToken,
      expiresAt: response.token.expiresAt,
    },
  };
}

export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  const response = await apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: credentials.username.trim(),
      password: credentials.password,
    }),
  });

  const session = toSession(response);
  setAccessToken(session.token.accessToken);
  return session;
}

export async function register(credentials: RegisterCredentials): Promise<AuthSession> {
  const response = await apiFetch<LoginResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: credentials.username.trim(),
      password: credentials.password,
      displayName: credentials.displayName?.trim() || undefined,
    }),
  });

  const session = toSession(response);
  setAccessToken(session.token.accessToken);
  return session;
}

export async function changePassword(
  credentials: ChangePasswordCredentials,
): Promise<AuthSession['token']> {
  const response = await apiFetch<ChangePasswordResponse>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      currentPassword: credentials.currentPassword,
      newPassword: credentials.newPassword,
    }),
  });

  return {
    accessToken: response.token.accessToken,
    expiresAt: response.token.expiresAt,
  };
}

export async function fetchCurrentUser(): Promise<User> {
  return apiFetch<User>('/api/auth/me');
}

export function applySessionToken(session: AuthSession | null): void {
  setAccessToken(session?.token.accessToken ?? null);
}

export function isSessionExpired(session: AuthSession): boolean {
  const expiresAt = Date.parse(session.token.expiresAt);

  if (Number.isNaN(expiresAt)) {
    return true;
  }

  return expiresAt <= Date.now();
}
