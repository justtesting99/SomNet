import type { MotorAutomaticControlState } from '@/types/motorModes';

/** Motor automatic-start payload (periodic v1 — doc 31). */
export function buildMotorAutomaticStartPayload(state: MotorAutomaticControlState): string {
  const { running: _running, ...snapshot } = state;
  return JSON.stringify({
    ...snapshot,
    actuatorKind: 'hbridge',
    endSessionMode:
      snapshot.endSessionMode === 'strokes' ? 'noAutoEnd' : snapshot.endSessionMode,
  });
}
