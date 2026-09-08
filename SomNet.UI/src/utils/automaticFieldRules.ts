import type { AutomaticControlState, AutomaticRunMode, EndSessionMode } from '@/types/modes';
import { normalizeAutomaticBurstFields } from '@/utils/burstFieldRules';

/** Main-program gap between strokes (not burst intra-stroke delay). */
export const MIN_STROKE_GAP_SECONDS = 1;

export interface AutomaticFieldRules {
  disableMinimumPower: boolean;
  disableStrokeMinSeconds: boolean;
  disableNoAutoEnd: boolean;
}

const MODES_REQUIRING_END_SESSION: AutomaticRunMode[] = [
  'buildUp',
  'powerWave',
  'powerAndTimingWave',
];

const MODES_DISABLE_MIN_POWER: AutomaticRunMode[] = ['periodic', 'randomTimingOnly'];

const MODES_DISABLE_MIN_STROKE_SECONDS: AutomaticRunMode[] = [
  'periodic',
  'randomPowerOnly',
  'powerWave',
];

export function getAutomaticFieldRules(mode: AutomaticRunMode): AutomaticFieldRules {
  return {
    disableMinimumPower: MODES_DISABLE_MIN_POWER.includes(mode),
    disableStrokeMinSeconds: MODES_DISABLE_MIN_STROKE_SECONDS.includes(mode),
    disableNoAutoEnd: MODES_REQUIRING_END_SESSION.includes(mode),
  };
}

export function coerceEndSessionMode(
  endSessionMode: EndSessionMode,
  disableNoAutoEnd: boolean,
): EndSessionMode {
  if (disableNoAutoEnd && endSessionMode === 'noAutoEnd') {
    return 'minutes';
  }

  return endSessionMode;
}

/** Apply automatic mode change and end-session coercion (P9P2-D22). */
export function applyAutomaticModeChange(
  state: AutomaticControlState,
  nextMode: AutomaticRunMode,
): AutomaticControlState {
  const rules = getAutomaticFieldRules(nextMode);

  return {
    ...state,
    automaticMode: nextMode,
    endSessionMode: coerceEndSessionMode(state.endSessionMode, rules.disableNoAutoEnd),
  };
}

/** Normalize loaded/saved automatic settings for mode-specific UI rules. */
export function normalizeAutomaticControlState(
  state: AutomaticControlState,
): AutomaticControlState {
  const withMode = applyAutomaticModeChange(state, state.automaticMode);

  let strokeMinSeconds = Math.max(
    MIN_STROKE_GAP_SECONDS,
    Math.round(withMode.strokeMinSeconds),
  );
  let strokeMaxSeconds = Math.max(
    MIN_STROKE_GAP_SECONDS,
    Math.round(withMode.strokeMaxSeconds),
  );

  if (strokeMinSeconds > strokeMaxSeconds) {
    strokeMinSeconds = strokeMaxSeconds;
  }

  return normalizeAutomaticBurstFields({
    ...withMode,
    strokeMinSeconds,
    strokeMaxSeconds,
  });
}
