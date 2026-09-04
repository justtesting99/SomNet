import type { SubTargetName } from '@/config/sessionUsers';
import { apiFetch } from '@/api/client';

interface SubsResponse {
  controllerRole: string;
  subRole: string;
  subs: SubTargetName[];
}

export async function fetchSubs(): Promise<SubTargetName[]> {
  const response = await apiFetch<SubsResponse>('/api/subs');
  return response.subs;
}

export async function addSub(subName: string): Promise<SubTargetName[]> {
  const response = await apiFetch<SubsResponse>('/api/subs', {
    method: 'POST',
    body: JSON.stringify({ subName }),
  });
  return response.subs;
}

export async function removeSub(subName: string): Promise<SubTargetName[]> {
  const params = new URLSearchParams({ subName });
  const response = await apiFetch<SubsResponse>(`/api/subs?${params.toString()}`, {
    method: 'DELETE',
  });
  return response.subs;
}
