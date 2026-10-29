import type { EndSessionMode } from '@/types/modes';
import {
  coerceMotorAutomaticRunMode,
  type MotorAutomaticRunMode,
} from '@/types/motorAutomaticModes';
import {
  defaultMotorAutomaticState,
  type MotorAutomaticControlState,
} from '@/types/motorModes';
import { coerceEndSessionMode, MIN_STROKE_GAP_SECONDS } from '@/utils/automaticFieldRules';
import {
  BURST_PLACEMENT_OPTIONS,
  burstMainTiming,
  burstPlacementSchedule,
  type BurstPlacement,
  resolveBurstPlacement,
} from '@/utils/burstPlacement';
import {
  MAX_BURST_DELAY_SEC,
  MAX_BURST_STROKES,
  MIN_BURST_DELAY_SEC,
  MIN_BURST_STROKE_POWER,
  getBurstFieldRules,
} from '@/utils/burstFieldRules';

export interface MotorAutomaticFieldRules {
  disableMinimumSpeed: boolean;
  disableSegmentMinSeconds: boolean;
  disableSegmentMaxSeconds: boolean;
  disableNoAutoEnd: boolean;
}

const MODES_REQUIRING_END_SESSION: MotorAutomaticRunMode[] = ['powerWave', 'buildUp'];

const MODES_DISABLE_MIN_SPEED: MotorAutomaticRunMode[] = ['periodic'];

const MODES_DISABLE_SEGMENT_MIN_SECONDS: MotorAutomaticRunMode[] = [
  'periodic',
  'randomSpeed',
  'powerWave',
];

const MODES_DISABLE_SEGMENT_MAX_SECONDS: MotorAutomaticRunMode[] = ['periodic'];

export function getMotorAutomaticFieldRules(
  mode: MotorAutomaticRunMode,
): MotorAutomaticFieldRules {
  return {
    disableMinimumSpeed: MODES_DISABLE_MIN_SPEED.includes(mode),
    disableSegmentMinSeconds: MODES_DISABLE_SEGMENT_MIN_SECONDS.includes(mode),
    disableSegmentMaxSeconds: MODES_DISABLE_SEGMENT_MAX_SECONDS.includes(mode),
    disableNoAutoEnd: MODES_REQUIRING_END_SESSION.includes(mode),
  };
}

/** MA-D27: Set Speed (periodic) allows session-spread burst placements only. */
export function coerceMotorBurstPlacementForMode(
  placement: BurstPlacement,
  mode: MotorAutomaticRunMode,
): BurstPlacement {
  if (mode !== 'periodic') {
    return placement;
  }
  if (burstPlacementSchedule(placement) === 'sessionSpread') {
    return placement;
  }
  return burstMainTiming(placement) === 'insteadOf'
    ? 'insteadOfSessionSpread'
    : 'mainPlusSessionSpread';
}

export function getMotorBurstPlacementOptions(mode: MotorAutomaticRunMode) {
  const periodic = mode === 'periodic';
  return BURST_PLACEMENT_OPTIONS.map((option) => ({
    ...option,
    disabled: periodic && burstPlacementSchedule(option.value) !== 'sessionSpread',
  }));
}

function applyMotorPeriodicBurstRules(
  state: MotorAutomaticControlState,
): MotorAutomaticControlState {
  if (state.automaticMode !== 'periodic' || !state.burstsOn) {
    return state;
  }

  const burstPlacement = coerceMotorBurstPlacementForMode(
    resolveBurstPlacement(state),
    state.automaticMode,
  );

  if (state.endSessionMode === 'minutes') {
    return { ...state, burstPlacement };
  }

  return {
    ...state,
    burstPlacement,
    endSessionMode: 'minutes',
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Motor v1 — stroke/rotation count end requires Hall feedback (doc 31). */
function normalizeEndSessionMode(mode: EndSessionMode): EndSessionMode {
  if (mode === 'strokes') {
    return 'noAutoEnd';
  }
  if (mode === 'minutes' || mode === 'noAutoEnd') {
    return mode;
  }
  return 'noAutoEnd';
}

function normalizeMotorBurstFields(
  state: MotorAutomaticControlState,
): MotorAutomaticControlState {
  const powerRules = getBurstFieldRules(state.burstStyle);

  let burstStrokePowerMin: number;
  let burstStrokePowerMax: number;

  if (powerRules.disableBurstStrokePowerMin) {
    burstStrokePowerMax = clampInt(state.burstStrokePowerMax, 0, 100);
    burstStrokePowerMin = burstStrokePowerMax;
  } else {
    let min = clampInt(state.burstStrokePowerMin, MIN_BURST_STROKE_POWER, 100);
    let max = clampInt(state.burstStrokePowerMax, 0, 100);
    if (min > max) {
      min = max;
    }
    burstStrokePowerMin = min;
    burstStrokePowerMax = max;
  }

  const delayRules = getBurstFieldRules(state.burstStyle);
  let burstDelayMin: number;
  let burstDelayMax: number;

  if (delayRules.disableBurstDelayMin) {
    burstDelayMax = clampInt(state.burstDelayMax, 0, MAX_BURST_DELAY_SEC);
    burstDelayMin = burstDelayMax;
  } else {
    burstDelayMin = clampInt(state.burstDelayMin, MIN_BURST_DELAY_SEC, MAX_BURST_DELAY_SEC);
    burstDelayMax = clampInt(state.burstDelayMax, 0, MAX_BURST_DELAY_SEC);
    if (burstDelayMin > burstDelayMax) {
      burstDelayMax = burstDelayMin;
    }
  }

  let burstStrokesMin = clampInt(state.burstStrokesMin, 1, MAX_BURST_STROKES);
  let burstStrokesMax = clampInt(state.burstStrokesMax, 1, MAX_BURST_STROKES);
  if (burstStrokesMin > burstStrokesMax) {
    burstStrokesMin = burstStrokesMax;
  }

  const withPlacement = {
    ...state,
    burstPlacement: resolveBurstPlacement(state),
    burstPercent: clampInt(state.burstPercent, 0, 100),
    burstStrokePowerMin,
    burstStrokePowerMax,
    burstDelayMin,
    burstDelayMax,
    burstStrokesMin,
    burstStrokesMax,
  };

  return applyMotorPeriodicBurstRules(withPlacement);
}

export function applyMotorAutomaticModeChange(
  state: MotorAutomaticControlState,
  nextMode: MotorAutomaticRunMode,
): MotorAutomaticControlState {
  const rules = getMotorAutomaticFieldRules(nextMode);

  const withMode: MotorAutomaticControlState = {
    ...state,
    automaticMode: nextMode,
    endSessionMode: coerceEndSessionMode(state.endSessionMode, rules.disableNoAutoEnd),
    burstPlacement: coerceMotorBurstPlacementForMode(
      resolveBurstPlacement(state),
      nextMode,
    ),
  };

  return applyMotorPeriodicBurstRules(withMode);
}

/** Clamp motor automatic form state (per-device pairing settings). */
export function normalizeMotorAutomaticControlState(
  state: MotorAutomaticControlState,
): MotorAutomaticControlState {
  const automaticMode = coerceMotorAutomaticRunMode(state.automaticMode);
  const withMode = applyMotorAutomaticModeChange(
    { ...state, automaticMode },
    automaticMode,
  );

  let minimumDutyPercent = clampInt(withMode.minimumDutyPercent, 0, 100);
  let maximumDutyPercent = clampInt(withMode.maximumDutyPercent, 0, 100);
  if (minimumDutyPercent > maximumDutyPercent) {
    [minimumDutyPercent, maximumDutyPercent] = [maximumDutyPercent, minimumDutyPercent];
  }

  let segmentMinSeconds = clampInt(withMode.segmentMinSeconds, MIN_STROKE_GAP_SECONDS, 3600);
  let segmentMaxSeconds = clampInt(withMode.segmentMaxSeconds, MIN_STROKE_GAP_SECONDS, 3600);
  if (segmentMinSeconds > segmentMaxSeconds) {
    [segmentMinSeconds, segmentMaxSeconds] = [segmentMaxSeconds, segmentMinSeconds];
  }

  const endSessionMode = normalizeEndSessionMode(withMode.endSessionMode);

  const normalized: MotorAutomaticControlState = {
    ...defaultMotorAutomaticState,
    ...withMode,
    running: false,
    minimumDutyPercent,
    maximumDutyPercent,
    minimumSpeedPercent: clampInt(withMode.minimumSpeedPercent, 0, 100),
    maximumSpeedPercent: clampInt(withMode.maximumSpeedPercent, 0, 100),
    segmentMinSeconds,
    segmentMaxSeconds,
    delayBeforeStartSeconds: clampInt(withMode.delayBeforeStartSeconds, 0, 3600),
    rampMs: clampInt(withMode.rampMs, 0, 30_000),
    endSessionMode,
    endSessionValue: clampInt(withMode.endSessionValue, 1, 1440),
  };

  return normalizeMotorBurstFields(normalized);
}
