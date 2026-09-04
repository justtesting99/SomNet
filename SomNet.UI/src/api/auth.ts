import type { LoginCredentials, User } from '@/types/auth';
import { apiFetch } from '@/api/client';

interface LoginResponse {
  user: User;
}

export async function login(credentials: LoginCredentials): Promise<User> {
  const response = await apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: credentials.username.trim(),
      password: credentials.password,
    }),
  });

  return response.user;
}
