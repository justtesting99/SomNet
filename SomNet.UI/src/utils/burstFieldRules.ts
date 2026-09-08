import type { AutomaticControlState, BurstStyle } from '@/types/modes';

export const MAX_BURST_STROKES = 100;
export const MAX_BURST_DELAY_SEC = 300;

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
  const power = normalizeMinMax(
    state.burstStrokePowerMin,
    state.burstStrokePowerMax,
    0,
    100,
  );
  const delay = normalizeMinMax(state.burstDelayMin, state.burstDelayMax, 0, MAX_BURST_DELAY_SEC);
  const strokes = normalizeMinMax(
    state.burstStrokesMin,
    state.burstStrokesMax,
    1,
    MAX_BURST_STROKES,
  );

  return {
    ...state,
    burstPercent: clampInt(state.burstPercent, 0, 100),
    burstStrokePowerMin: power.min,
    burstStrokePowerMax: power.max,
    burstDelayMin: delay.min,
    burstDelayMax: delay.max,
    burstStrokesMin: strokes.min,
    burstStrokesMax: strokes.max,
  };
}
