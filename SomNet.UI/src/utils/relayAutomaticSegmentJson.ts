export interface RelayAutomaticSegmentEvent {
  segmentIndex: number;
  phase: 'stroke' | 'gap';
  powerPercent: number;
  durationMs: number;
  programElapsedMs: number;
}

export function parseRelayAutomaticSegmentJson(
  resultJson: string | null | undefined,
): RelayAutomaticSegmentEvent | null {
  if (!resultJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(resultJson) as Record<string, unknown>;
    if (parsed.commandKey !== 'relay-automatic-segment') {
      return null;
    }

    const phase = parsed.phase;
    if (phase !== 'stroke' && phase !== 'gap') {
      return null;
    }

    const segmentIndex = Number(parsed.segmentIndex);
    const powerPercent = Number(parsed.powerPercent);
    const durationMs = Number(parsed.durationMs);
    const programElapsedMs = Number(parsed.programElapsedMs);

    if (
      !Number.isFinite(segmentIndex) ||
      !Number.isFinite(powerPercent) ||
      !Number.isFinite(durationMs) ||
      !Number.isFinite(programElapsedMs)
    ) {
      return null;
    }

    return {
      segmentIndex,
      phase,
      powerPercent: Math.min(100, Math.max(0, Math.round(powerPercent))),
      durationMs: Math.max(0, Math.round(durationMs)),
      programElapsedMs: Math.max(0, Math.round(programElapsedMs)),
    };
  } catch {
    return null;
  }
}
