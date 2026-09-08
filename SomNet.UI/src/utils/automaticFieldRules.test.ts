import { describe, expect, it } from 'vitest';
import { AUTOMATIC_RUN_MODE_OPTIONS } from '@/types/modes';
import { defaultAutomaticState } from '@/types/modes';
import {
  applyAutomaticModeChange,
  coerceEndSessionMode,
  getAutomaticFieldRules,
  MIN_STROKE_GAP_SECONDS,
  normalizeAutomaticControlState,
} from '@/utils/automaticFieldRules';

const EXPECTED_FIELD_RULES: Record<
  (typeof AUTOMATIC_RUN_MODE_OPTIONS)[number]['value'],
  ReturnType<typeof getAutomaticFieldRules>
> = {
  periodic: {
    disableMinimumPower: true,
    disableStrokeMinSeconds: true,
    disableNoAutoEnd: false,
  },
  randomPowerOnly: {
    disableMinimumPower: false,
    disableStrokeMinSeconds: true,
    disableNoAutoEnd: false,
  },
  randomTimingOnly: {
    disableMinimumPower: true,
    disableStrokeMinSeconds: false,
    disableNoAutoEnd: false,
  },
  randomPowerAndTiming: {
    disableMinimumPower: false,
    disableStrokeMinSeconds: false,
    disableNoAutoEnd: false,
  },
  powerWave: {
    disableMinimumPower: false,
    disableStrokeMinSeconds: true,
    disableNoAutoEnd: true,
  },
  powerAndTimingWave: {
    disableMinimumPower: false,
    disableStrokeMinSeconds: false,
    disableNoAutoEnd: true,
  },
  buildUp: {
    disableMinimumPower: false,
    disableStrokeMinSeconds: false,
    disableNoAutoEnd: true,
  },
};

describe('getAutomaticFieldRules', () => {
  it.each(AUTOMATIC_RUN_MODE_OPTIONS.map((option) => [option.value, option.label] as const))(
    'matches §1 disable matrix for %s',
    (mode) => {
      expect(getAutomaticFieldRules(mode)).toEqual(EXPECTED_FIELD_RULES[mode]);
    },
  );
});

describe('coerceEndSessionMode', () => {
  it('switches noAutoEnd to minutes when required', () => {
    expect(coerceEndSessionMode('noAutoEnd', true)).toBe('minutes');
  });

  it('keeps noAutoEnd when allowed', () => {
    expect(coerceEndSessionMode('noAutoEnd', false)).toBe('noAutoEnd');
  });
});

describe('applyAutomaticModeChange', () => {
  it('coerces end session when selecting build-up from noAutoEnd', () => {
    const next = applyAutomaticModeChange(
      { ...defaultAutomaticState, endSessionMode: 'noAutoEnd' },
      'buildUp',
    );

    expect(next.automaticMode).toBe('buildUp');
    expect(next.endSessionMode).toBe('minutes');
  });

  it('preserves stored values when switching modes (P9P2-D2)', () => {
    const state = {
      ...defaultAutomaticState,
      minimumPower: 15,
      maximumPower: 80,
      strokeMinSeconds: 3,
      strokeMaxSeconds: 25,
      endSessionValue: 42,
      automaticMode: 'randomPowerAndTiming' as const,
    };

    const periodic = applyAutomaticModeChange(state, 'periodic');
    expect(periodic.minimumPower).toBe(15);
    expect(periodic.maximumPower).toBe(80);
    expect(periodic.strokeMinSeconds).toBe(3);
    expect(periodic.strokeMaxSeconds).toBe(25);
    expect(periodic.endSessionValue).toBe(42);
    expect(periodic.automaticMode).toBe('periodic');
    expect(periodic.endSessionMode).toBe('noAutoEnd');

    const buildUp = applyAutomaticModeChange(state, 'buildUp');
    expect(buildUp.minimumPower).toBe(15);
    expect(buildUp.endSessionMode).toBe('minutes');
  });
});

describe('normalizeAutomaticControlState', () => {
  it('clamps stroke gap seconds to at least 1', () => {
    const normalized = normalizeAutomaticControlState({
      ...defaultAutomaticState,
      strokeMinSeconds: 0,
      strokeMaxSeconds: 0,
    });

    expect(normalized.strokeMinSeconds).toBe(MIN_STROKE_GAP_SECONDS);
    expect(normalized.strokeMaxSeconds).toBe(MIN_STROKE_GAP_SECONDS);
  });

  it('fixes min greater than max after clamping', () => {
    const normalized = normalizeAutomaticControlState({
      ...defaultAutomaticState,
      strokeMinSeconds: 5,
      strokeMaxSeconds: 0,
    });

    expect(normalized.strokeMinSeconds).toBe(MIN_STROKE_GAP_SECONDS);
    expect(normalized.strokeMaxSeconds).toBe(MIN_STROKE_GAP_SECONDS);
  });
});
