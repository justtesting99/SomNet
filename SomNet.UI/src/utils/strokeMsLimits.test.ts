import { describe, expect, it } from 'vitest';
import {
  clampMaximumStrokeMs,
  clampMinimumStrokeMs,
  normalizeStrokeMsPair,
} from '@/utils/strokeMsLimits';

const limits = { absoluteMinimum: 25, absoluteMaximum: 800 };

describe('stroke limit clamping (§6.3.2 regression)', () => {
  it('clamps min and max stroke ms to device bounds', () => {
    expect(normalizeStrokeMsPair(5, 900, limits)).toEqual({
      minimumStrokeMs: 25,
      maximumStrokeMs: 800,
    });
  });

  it('keeps min ≤ max when maximum is set below minimum', () => {
    const nextMin = clampMinimumStrokeMs(400, 200, limits);
    expect(nextMin).toEqual({ minimumStrokeMs: 400, maximumStrokeMs: 400 });

    expect(clampMaximumStrokeMs(50, 200, limits)).toBe(200);
  });
});
