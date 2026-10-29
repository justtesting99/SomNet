import type { MotorAutomaticControlState } from '@/types/motorModes';
import type { AppOptions } from '@/types/options';
import { normalizeMotorAutomaticControlState } from '@/utils/motorAutomaticFieldRules';
import { resolveMotorSegmentTargetRampMs } from '@/utils/motorSegmentTargetRamp';

/** Motor automatic-start payload (periodic v1 — doc 31). */
export function buildMotorAutomaticStartPayload(
  state: MotorAutomaticControlState,
  appOptions: Pick<AppOptions, 'motorSegmentTargetRampMode' | 'motorSegmentTargetRampMs'>,
): string {
  const normalized = normalizeMotorAutomaticControlState(state);
  const { running: _running, ...snapshot } = normalized;
  const segmentTargetRampMs = resolveMotorSegmentTargetRampMs(
    normalized.automaticMode,
    appOptions,
  );
  return JSON.stringify({
    actuatorKind: 'hbridge',
    segmentTargetRampMs,
    ...snapshot,
    endSessionMode:
      snapshot.endSessionMode === 'strokes' ? 'noAutoEnd' : snapshot.endSessionMode,
  });
}
