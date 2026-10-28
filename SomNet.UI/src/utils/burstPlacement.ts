import type { AutomaticControlState } from '@/types/modes';

/** Wire JSON values for `burstPlacement` (doc 36 + main-timing variants). */
export type BurstPlacement =
  | 'sessionSpread'
  | 'afterMainStroke'
  | 'chanceAfterMainStroke'
  | 'mainPlusSessionSpread'
  | 'mainPlusAfterMainStroke'
  | 'mainPlusChanceAfterMainStroke'
  | 'insteadOfSessionSpread'
  | 'insteadOfAfterMainStroke'
  | 'insteadOfChanceAfterMainStroke';

export type BurstPlacementSchedule =
  | 'sessionSpread'
  | 'afterMainStroke'
  | 'chanceAfterMainStroke';

export type BurstMainTiming = 'mainPlus' | 'insteadOf';

export const BURST_PLACEMENT_OPTIONS: { value: BurstPlacement; label: string }[] = [
  { value: 'mainPlusSessionSpread', label: 'Main + spread across session' },
  { value: 'insteadOfSessionSpread', label: 'Burst instead of main — spread across session' },
  { value: 'mainPlusAfterMainStroke', label: 'Main + after main strokes (even)' },
  { value: 'insteadOfAfterMainStroke', label: 'Burst instead of main — even spacing' },
  { value: 'mainPlusChanceAfterMainStroke', label: 'Main + chance after each main stroke' },
  { value: 'insteadOfChanceAfterMainStroke', label: 'Burst instead of main — chance per stroke' },
];

export const DEFAULT_BURST_PLACEMENT: BurstPlacement = 'mainPlusSessionSpread';

const KNOWN_PLACEMENTS = new Set<string>([
  'sessionSpread',
  'afterMainStroke',
  'chanceAfterMainStroke',
  'mainPlusSessionSpread',
  'mainPlusAfterMainStroke',
  'mainPlusChanceAfterMainStroke',
  'insteadOfSessionSpread',
  'insteadOfAfterMainStroke',
  'insteadOfChanceAfterMainStroke',
]);

export function resolveBurstPlacement(
  state: Pick<AutomaticControlState, 'burstPlacement'>,
): BurstPlacement {
  const value = state.burstPlacement;
  if (value && KNOWN_PLACEMENTS.has(value)) {
    return value;
  }
  return DEFAULT_BURST_PLACEMENT;
}

export function burstMainTiming(placement: BurstPlacement): BurstMainTiming {
  switch (placement) {
    case 'insteadOfSessionSpread':
    case 'insteadOfAfterMainStroke':
    case 'insteadOfChanceAfterMainStroke':
      return 'insteadOf';
    case 'sessionSpread':
    case 'afterMainStroke':
    case 'chanceAfterMainStroke':
    case 'mainPlusSessionSpread':
    case 'mainPlusAfterMainStroke':
    case 'mainPlusChanceAfterMainStroke':
    default:
      return 'mainPlus';
  }
}

export function burstPlacementSchedule(placement: BurstPlacement): BurstPlacementSchedule {
  switch (placement) {
    case 'afterMainStroke':
    case 'mainPlusAfterMainStroke':
    case 'insteadOfAfterMainStroke':
      return 'afterMainStroke';
    case 'chanceAfterMainStroke':
    case 'mainPlusChanceAfterMainStroke':
    case 'insteadOfChanceAfterMainStroke':
      return 'chanceAfterMainStroke';
    case 'sessionSpread':
    case 'mainPlusSessionSpread':
    case 'insteadOfSessionSpread':
    default:
      return 'sessionSpread';
  }
}

export function burstPercentFieldLabel(placement: BurstPlacement): string {
  const schedule = burstPlacementSchedule(placement);
  switch (schedule) {
    case 'afterMainStroke':
      return 'Percent of main strokes (even spacing)';
    case 'chanceAfterMainStroke':
      return 'Chance per main stroke opportunity (%)';
    case 'sessionSpread':
    default:
      return 'Percent (0 to 100)';
  }
}
