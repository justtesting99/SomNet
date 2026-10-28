import type { AutomaticControlState } from '@/types/modes';

export type BurstPlacement = 'sessionSpread' | 'afterMainStroke' | 'chanceAfterMainStroke';

export const BURST_PLACEMENT_OPTIONS: { value: BurstPlacement; label: string }[] = [
  { value: 'sessionSpread', label: 'Spread across session' },
  { value: 'afterMainStroke', label: 'After main strokes (even)' },
  { value: 'chanceAfterMainStroke', label: 'Chance after each main stroke' },
];

export const DEFAULT_BURST_PLACEMENT: BurstPlacement = 'sessionSpread';

export function resolveBurstPlacement(
  state: Pick<AutomaticControlState, 'burstPlacement'>,
): BurstPlacement {
  const value = state.burstPlacement;
  if (
    value === 'afterMainStroke' ||
    value === 'chanceAfterMainStroke' ||
    value === 'sessionSpread'
  ) {
    return value;
  }
  return DEFAULT_BURST_PLACEMENT;
}

export function burstPercentFieldLabel(placement: BurstPlacement): string {
  switch (placement) {
    case 'afterMainStroke':
      return 'Percent of main strokes (even spacing)';
    case 'chanceAfterMainStroke':
      return 'Chance after each main stroke (%)';
    case 'sessionSpread':
    default:
      return 'Percent (0 to 100)';
  }
}
