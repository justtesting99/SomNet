export interface BurstResultJson {
  commandKey?: string;
  powerPercent?: number;
  strokeMs?: number;
  requestedStrokes?: number;
  strokesCompleted?: number;
  burstDelayMs?: number;
  interrupted?: boolean;
  reason?: string;
}

export function parseBurstResultJson(resultJson?: string | null): BurstResultJson | null {
  if (!resultJson) {
    return null;
  }

  try {
    return JSON.parse(resultJson) as BurstResultJson;
  } catch {
    return null;
  }
}
