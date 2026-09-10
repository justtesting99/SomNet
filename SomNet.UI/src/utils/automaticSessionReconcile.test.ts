import { describe, expect, it } from 'vitest';
import { isDeviceAutomaticIdleMessage } from '@/utils/automaticSessionReconcile';

describe('isDeviceAutomaticIdleMessage', () => {
  it('detects idle automatic session rejections', () => {
    expect(isDeviceAutomaticIdleMessage('no automatic session running')).toBe(true);
  });

  it('rejects unrelated messages', () => {
    expect(isDeviceAutomaticIdleMessage('Device rejected the command.')).toBe(false);
  });
});
