import type { AppOptions } from '@/types/options';
import { apiFetch } from '@/api/client';

export async function fetchOptions(username: string): Promise<AppOptions> {
  const params = new URLSearchParams({ username });
  return apiFetch<AppOptions>(`/api/options?${params.toString()}`);
}

export async function saveOptions(username: string, options: AppOptions): Promise<AppOptions> {
  const params = new URLSearchParams({ username });
  return apiFetch<AppOptions>(`/api/options?${params.toString()}`, {
    method: 'PUT',
    body: JSON.stringify(options),
  });
}
