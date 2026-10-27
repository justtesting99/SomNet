export interface MotorRunResultJson {
  dutyPercent?: number;
  durationMs?: number;
  actualDurationMs?: number;
  interrupted?: boolean;
}

export function parseMotorRunResultJson(resultJson: string | null | undefined): MotorRunResultJson | null {
  if (!resultJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(resultJson) as MotorRunResultJson;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
