import { describe, expect, it, vi } from 'vitest';
import {
  applyAutomaticDeviceComplete,
  computeAutomaticStopGraceMs,
  waitForAutomaticHubFinalize,
} from '@/utils/automaticSessionFinalize';
import { defaultAutomaticState } from '@/types/modes';

describe('computeAutomaticStopGraceMs', () => {
  it('uses burst worst-case when bursts are on', () => {
    const grace = computeAutomaticStopGraceMs({
      ...defaultAutomaticState,
      burstsOn: true,
      maximumStrokeMs: 325,
      burstStrokesMax: 7,
      burstDelayMax: 5,
    });

    // 7×325ms + 6×5s gaps + margin
    expect(grace).toBe(7 * 325 + 6 * 5000 + 5000);
  });

  it('uses main stroke gap when bursts are off', () => {
    const grace = computeAutomaticStopGraceMs({
      ...defaultAutomaticState,
      burstsOn: false,
      maximumStrokeMs: 325,
      strokeMaxSeconds: 5,
    });

    expect(grace).toBe(15_000);
  });
});

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
  it('clears running and ends session with device result', async () => {
    const updateAutomatic = vi.fn();
    const endAutomaticSession = vi.fn().mockResolvedValue(undefined);

    await applyAutomaticDeviceComplete(
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

  it('no-ops when session is not running', async () => {
    const updateAutomatic = vi.fn();
    const endAutomaticSession = vi.fn();

    await applyAutomaticDeviceComplete(
      { ...defaultAutomaticState, running: false },
      { commandKey: 'automatic-stop', strokesCompleted: 1 },
      updateAutomatic,
      endAutomaticSession,
    );

    expect(updateAutomatic).not.toHaveBeenCalled();
    expect(endAutomaticSession).not.toHaveBeenCalled();
  });

  it('finalizes rehydrated session when running flag is false but session is active', async () => {
    const updateAutomatic = vi.fn();
    const endAutomaticSession = vi.fn().mockResolvedValue(undefined);

    await applyAutomaticDeviceComplete(
      { ...defaultAutomaticState, running: false },
      { commandKey: 'automatic-stop', strokesCompleted: 5, endReason: 'endSession' },
      updateAutomatic,
      endAutomaticSession,
      true,
    );

    expect(updateAutomatic).toHaveBeenCalledWith(
      expect.objectContaining({ running: false }),
    );
    expect(endAutomaticSession).toHaveBeenCalled();
  });
});
