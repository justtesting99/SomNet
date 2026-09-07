import { describe, expect, it } from 'vitest';
import { AUTOMATIC_RUN_MODE_OPTIONS } from '@/types/modes';
import { defaultAutomaticState } from '@/types/modes';
import {
  applyAutomaticModeChange,
  coerceEndSessionMode,
  getAutomaticFieldRules,
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
});
