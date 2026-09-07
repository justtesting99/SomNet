export interface AutomaticResultJson {
  commandKey?: string;
  automaticMode?: string;
  powerPercent?: number;
  strokeMs?: number;
  gapSec?: number;
  strokesCompleted?: number;
  durationMs?: number;
  /** 0 = noAutoEnd, 1 = minutes, 2 = strokes (device wire format) */
  endSessionMode?: number;
  endSessionValue?: number;
  interrupted?: boolean;
  endReason?: string;
}

export function parseAutomaticResultJson(
  resultJson?: string | null,
): AutomaticResultJson | null {
  if (!resultJson) {
    return null;
  }

  try {
    return JSON.parse(resultJson) as AutomaticResultJson;
  } catch {
    return null;
  }
}

export function isAutomaticStopResultJson(
  parsed: AutomaticResultJson | null,
): parsed is AutomaticResultJson {
  return parsed?.commandKey === 'automatic-stop';
}
