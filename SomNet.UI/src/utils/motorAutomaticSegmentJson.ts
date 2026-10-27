export interface MotorAutomaticSegmentEvent {
  segmentIndex: number;
  fromSpeedPercent: number;
  toSpeedPercent: number;
  durationMs: number;
  programElapsedMs: number;
}

export function parseMotorAutomaticSegmentJson(
  resultJson: string | null | undefined,
): MotorAutomaticSegmentEvent | null {
  if (!resultJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(resultJson) as Record<string, unknown>;
    if (parsed.commandKey !== 'motor-automatic-segment') {
      return null;
    }

    const segmentIndex = Number(parsed.segmentIndex);
    const fromSpeedPercent = Number(parsed.fromSpeedPercent);
    const toSpeedPercent = Number(parsed.toSpeedPercent);
    const durationMs = Number(parsed.durationMs);
    const programElapsedMs = Number(parsed.programElapsedMs);

    if (
      !Number.isFinite(segmentIndex) ||
      !Number.isFinite(fromSpeedPercent) ||
      !Number.isFinite(toSpeedPercent) ||
      !Number.isFinite(durationMs) ||
      !Number.isFinite(programElapsedMs)
    ) {
      return null;
    }

    return {
      segmentIndex,
      fromSpeedPercent,
      toSpeedPercent,
      durationMs,
      programElapsedMs,
    };
  } catch {
    return null;
  }
}
