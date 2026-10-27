import { describe, expect, it } from 'vitest';
import {
  computeMotorChartViewRange,
  zoomInWindowSec,
  zoomOutWindowSec,
} from '@/utils/motorChartViewRange';

describe('computeMotorChartViewRange', () => {
  it('shows full window from zero when not focused', () => {
    const view = computeMotorChartViewRange(120, 60, null);
    expect(view.startSec).toBe(0);
    expect(view.endSec).toBe(60);
  });

  it('centers on focus and clamps at horizon end', () => {
    const view = computeMotorChartViewRange(100, 40, 95);
    expect(view.endSec).toBe(100);
    expect(view.startSec).toBe(60);
  });
});

describe('zoomInWindowSec', () => {
  it('shrinks window', () => {
    expect(zoomInWindowSec(60, 180)).toBeLessThan(60);
  });
});

describe('zoomOutWindowSec', () => {
  it('grows window toward horizon', () => {
    expect(zoomOutWindowSec(30, 180)).toBeGreaterThan(30);
    expect(zoomOutWindowSec(200, 180)).toBe(180);
  });
});
