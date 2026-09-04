import type { SubTargetName } from '@/config/sessionUsers';
import { apiFetch } from '@/api/client';

interface SubsResponse {
  controllerRole: string;
  subRole: string;
  subs: SubTargetName[];
}

export async function fetchSubs(domTarget: string): Promise<SubTargetName[]> {
  const params = new URLSearchParams({ domTarget });
  const response = await apiFetch<SubsResponse>(`/api/subs?${params.toString()}`);
  return response.subs;
}
