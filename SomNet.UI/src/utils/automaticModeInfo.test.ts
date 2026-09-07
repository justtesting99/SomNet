import { describe, expect, it } from 'vitest';
import { AUTOMATIC_RUN_MODE_OPTIONS } from '@/types/modes';
import { getAutomaticModeInfo } from '@/utils/automaticModeInfo';

describe('getAutomaticModeInfo', () => {
  it('provides a summary for every automatic mode option', () => {
    for (const option of AUTOMATIC_RUN_MODE_OPTIONS) {
      const info = getAutomaticModeInfo(option.value);

      expect(info.summary.length).toBeGreaterThan(10);
    }
  });

  it('includes end session notes for wave and build-up modes', () => {
    expect(getAutomaticModeInfo('powerWave').endSessionNote).toMatch(/pre-calculated/i);
    expect(getAutomaticModeInfo('powerAndTimingWave').endSessionNote).toMatch(/No AutoEnd/i);
    expect(getAutomaticModeInfo('buildUp').endSessionNote).toMatch(/Build-up schedule/i);
  });

  it('does not include end session notes for random modes', () => {
    expect(getAutomaticModeInfo('randomPowerAndTiming').endSessionNote).toBeUndefined();
  });
});
