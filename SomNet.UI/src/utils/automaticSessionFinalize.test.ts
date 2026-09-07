import { describe, expect, it, vi } from 'vitest';
import {
  applyAutomaticDeviceComplete,
  waitForAutomaticHubFinalize,
} from '@/utils/automaticSessionFinalize';
import { defaultAutomaticState } from '@/types/modes';

describe('waitForAutomaticHubFinalize', () => {
  it('returns immediately when running clears before grace elapses', async () => {
    let running = true;
    const fallback = vi.fn();

    setTimeout(() => {
      running = false;
    }, 50);

    await waitForAutomaticHubFinalize(
      () => running,
      fallback,
      200,
      25,
    );

    expect(fallback).not.toHaveBeenCalled();
  });

  it('calls fallback when still running after grace', async () => {
    const fallback = vi.fn();

    await waitForAutomaticHubFinalize(
      () => true,
      fallback,
      80,
      20,
    );

    expect(fallback).toHaveBeenCalledTimes(1);
  });
});

describe('applyAutomaticDeviceComplete', () => {
  it('clears running and ends session with device result', () => {
    const updateAutomatic = vi.fn();
    const endAutomaticSession = vi.fn();

    applyAutomaticDeviceComplete(
      { ...defaultAutomaticState, running: true },
      { commandKey: 'automatic-stop', strokesCompleted: 3, endReason: 'abort', interrupted: true },
      updateAutomatic,
      endAutomaticSession,
    );

    expect(updateAutomatic).toHaveBeenCalledWith(
      expect.objectContaining({ running: false }),
    );
    expect(endAutomaticSession).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ endReason: 'abort' }),
    );
  });

  it('no-ops when session is not running', () => {
    const updateAutomatic = vi.fn();
    const endAutomaticSession = vi.fn();

    applyAutomaticDeviceComplete(
      { ...defaultAutomaticState, running: false },
      { commandKey: 'automatic-stop', strokesCompleted: 1 },
      updateAutomatic,
      endAutomaticSession,
    );

    expect(updateAutomatic).not.toHaveBeenCalled();
    expect(endAutomaticSession).not.toHaveBeenCalled();
  });
});
