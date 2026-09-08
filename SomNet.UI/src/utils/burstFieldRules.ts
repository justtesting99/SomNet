import type { AutomaticControlState, BurstStyle } from '@/types/modes';

export const MAX_BURST_STROKES = 100;
export const MAX_BURST_DELAY_SEC = 300;
export const MIN_BURST_DELAY_SEC = 1;
export const MIN_BURST_STROKE_POWER = 1;

export interface BurstFieldRules {
  disableBurstStrokePowerMin: boolean;
  disableBurstDelayMin: boolean;
}

export function getBurstFieldRules(burstStyle: BurstStyle): BurstFieldRules {
  switch (burstStyle) {
    case 'randomPowerOnly':
      return { disableBurstStrokePowerMin: false, disableBurstDelayMin: true };
    case 'randomDelayOnly':
      return { disableBurstStrokePowerMin: true, disableBurstDelayMin: false };
    case 'randomPowerAndDelay':
      return { disableBurstStrokePowerMin: false, disableBurstDelayMin: false };
    case 'fixedPowerDelay':
    default:
      return { disableBurstStrokePowerMin: true, disableBurstDelayMin: true };
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeMinMax(
  min: number,
  max: number,
  minLimit: number,
  maxLimit: number,
): { min: number; max: number } {
  let normalizedMin = clampInt(min, minLimit, maxLimit);
  let normalizedMax = clampInt(max, minLimit, maxLimit);

  if (normalizedMin > normalizedMax) {
    normalizedMin = normalizedMax;
  }

  return { min: normalizedMin, max: normalizedMax };
}

/** Clamp burst ranges to API/device caps; ensure min ≤ max (Part 2 / P10-D9). */
export function normalizeAutomaticBurstFields(
  state: AutomaticControlState,
): AutomaticControlState {
  let burstStrokePowerMin = clampInt(state.burstStrokePowerMin, MIN_BURST_STROKE_POWER, 100);
  let burstStrokePowerMax = clampInt(state.burstStrokePowerMax, 0, 100);
  if (burstStrokePowerMin > burstStrokePowerMax) {
    burstStrokePowerMax = burstStrokePowerMin;
  }

  let burstDelayMin = clampInt(state.burstDelayMin, MIN_BURST_DELAY_SEC, MAX_BURST_DELAY_SEC);
  let burstDelayMax = clampInt(state.burstDelayMax, 0, MAX_BURST_DELAY_SEC);
  if (burstDelayMin > burstDelayMax) {
    burstDelayMax = burstDelayMin;
  }

  const strokes = normalizeMinMax(
    state.burstStrokesMin,
    state.burstStrokesMax,
    1,
    MAX_BURST_STROKES,
  );

  return {
    ...state,
    burstPercent: clampInt(state.burstPercent, 0, 100),
    burstStrokePowerMin,
    burstStrokePowerMax,
    burstDelayMin,
    burstDelayMax,
    burstStrokesMin: strokes.min,
    burstStrokesMax: strokes.max,
  };
}
