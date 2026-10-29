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

type BurstPowerFields = Pick<
  AutomaticControlState,
  'burstStyle' | 'burstStrokePowerMin' | 'burstStrokePowerMax'
>;

/** When min is unused (fixed power), show Max in the disabled Min field. */
export function burstStrokePowerMinForDisplay(state: BurstPowerFields): number {
  if (getBurstFieldRules(state.burstStyle).disableBurstStrokePowerMin) {
    return state.burstStrokePowerMax;
  }
  return state.burstStrokePowerMin;
}

export function burstStrokePowerNeedsMinSync(state: BurstPowerFields): boolean {
  const rules = getBurstFieldRules(state.burstStyle);
  return rules.disableBurstStrokePowerMin && state.burstStrokePowerMin !== state.burstStrokePowerMax;
}

type BurstDelayFields = Pick<AutomaticControlState, 'burstStyle' | 'burstDelayMin' | 'burstDelayMax'>;

export function burstDelayMinForDisplay(state: BurstDelayFields): number {
  if (getBurstFieldRules(state.burstStyle).disableBurstDelayMin) {
    return state.burstDelayMax;
  }
  return state.burstDelayMin;
}

export function burstDelayNeedsMinSync(state: BurstDelayFields): boolean {
  const rules = getBurstFieldRules(state.burstStyle);
  return rules.disableBurstDelayMin && state.burstDelayMin !== state.burstDelayMax;
}

/** Clamp burst ranges to API/device caps; ensure min ≤ max (Part 2 / P10-D9). */
export function normalizeAutomaticBurstFields(
  state: AutomaticControlState,
): AutomaticControlState {
  const burstRules = getBurstFieldRules(state.burstStyle);

  let burstStrokePowerMin: number;
  let burstStrokePowerMax: number;

  if (burstRules.disableBurstStrokePowerMin) {
    burstStrokePowerMax = clampInt(state.burstStrokePowerMax, 0, 100);
    // Device uses max only — do not let a stale min block lowering max (fixed / random-delay styles).
    burstStrokePowerMin = burstStrokePowerMax;
  } else {
    const power = normalizeMinMax(
      state.burstStrokePowerMin,
      state.burstStrokePowerMax,
      MIN_BURST_STROKE_POWER,
      100,
    );
    burstStrokePowerMin = power.min;
    burstStrokePowerMax = power.max;
  }

  let burstDelayMin: number;
  let burstDelayMax: number;

  if (burstRules.disableBurstDelayMin) {
    burstDelayMax = clampInt(state.burstDelayMax, 0, MAX_BURST_DELAY_SEC);
    burstDelayMin = burstDelayMax;
  } else {
    const delay = normalizeMinMax(
      state.burstDelayMin,
      state.burstDelayMax,
      MIN_BURST_DELAY_SEC,
      MAX_BURST_DELAY_SEC,
    );
    burstDelayMin = delay.min;
    burstDelayMax = delay.max;
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
