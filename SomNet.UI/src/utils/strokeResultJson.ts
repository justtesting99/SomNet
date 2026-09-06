export interface StrokeResultJson {
  commandKey?: string;
  powerPercent?: number;
  strokeMs?: number;
  requestedStrokeMs?: number;
  actualStrokeMs?: number;
  success?: boolean;
  interrupted?: boolean;
  reason?: string;
}

export function parseStrokeResultJson(resultJson?: string | null): StrokeResultJson | null {
  if (!resultJson) {
    return null;
  }

  try {
    return JSON.parse(resultJson) as StrokeResultJson;
  } catch {
    return null;
  }
}
