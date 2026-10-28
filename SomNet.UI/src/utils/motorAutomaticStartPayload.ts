import type { MotorAutomaticControlState } from '@/types/motorModes';
import { normalizeMotorAutomaticControlState } from '@/utils/motorAutomaticFieldRules';

/** Motor automatic-start payload (periodic v1 — doc 31). */
export function buildMotorAutomaticStartPayload(state: MotorAutomaticControlState): string {
  const normalized = normalizeMotorAutomaticControlState(state);
  const { running: _running, ...snapshot } = normalized;
  return JSON.stringify({
    ...snapshot,
    actuatorKind: 'hbridge',
    endSessionMode:
      snapshot.endSessionMode === 'strokes' ? 'noAutoEnd' : snapshot.endSessionMode,
  });
}
