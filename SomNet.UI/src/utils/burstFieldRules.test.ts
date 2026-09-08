import { describe, expect, it } from 'vitest';
import { defaultAutomaticState, type BurstStyle } from '@/types/modes';
import {
  getBurstFieldRules,
  normalizeAutomaticBurstFields,
} from '@/utils/burstFieldRules';

const EXPECTED_BURST_RULES: Record<
  BurstStyle,
  ReturnType<typeof getBurstFieldRules>
> = {
  fixedPowerDelay: { disableBurstStrokePowerMin: true, disableBurstDelayMin: true },
  randomPowerOnly: { disableBurstStrokePowerMin: false, disableBurstDelayMin: true },
  randomDelayOnly: { disableBurstStrokePowerMin: true, disableBurstDelayMin: false },
  randomPowerAndDelay: { disableBurstStrokePowerMin: false, disableBurstDelayMin: false },
};

describe('getBurstFieldRules', () => {
  it.each(Object.entries(EXPECTED_BURST_RULES) as [BurstStyle, (typeof EXPECTED_BURST_RULES)[BurstStyle]][])(
    'matches §2.1 for %s',
    (style, rules) => {
      expect(getBurstFieldRules(style)).toEqual(rules);
    },
  );
});

describe('normalizeAutomaticBurstFields', () => {
  it('clamps burst percent and min/max pairs', () => {
    const normalized = normalizeAutomaticBurstFields({
      ...defaultAutomaticState,
      burstPercent: 150,
      burstStrokePowerMin: 80,
      burstStrokePowerMax: 40,
      burstDelayMin: 400,
      burstDelayMax: 2,
      burstStrokesMin: 200,
      burstStrokesMax: 3,
    });

    expect(normalized.burstPercent).toBe(100);
    expect(normalized.burstStrokePowerMin).toBe(80);
    expect(normalized.burstStrokePowerMax).toBe(80);
    expect(normalized.burstDelayMin).toBe(300);
    expect(normalized.burstDelayMax).toBe(300);
    expect(normalized.burstStrokesMin).toBe(3);
    expect(normalized.burstStrokesMax).toBe(3);
  });

  it('clamps burst min power and min delay to at least 1', () => {
    const normalized = normalizeAutomaticBurstFields({
      ...defaultAutomaticState,
      burstStrokePowerMin: 0,
      burstStrokePowerMax: 50,
      burstDelayMin: 0,
      burstDelayMax: 5,
    });

    expect(normalized.burstStrokePowerMin).toBe(1);
    expect(normalized.burstDelayMin).toBe(1);
  });
});
