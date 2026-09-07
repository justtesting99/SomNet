import type { AutomaticControlState, AutomaticRunMode, EndSessionMode } from '@/types/modes';

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
  return applyAutomaticModeChange(state, state.automaticMode);
}
