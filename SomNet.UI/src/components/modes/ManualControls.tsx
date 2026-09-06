import { useEffect, useMemo, useState } from 'react';
import { type ManualControlState } from '@/types/modes';
import { useOptions } from '@/context/OptionsProvider';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import { Panel } from '@/components/ui/Panel';
import { CommandButton } from '@/components/ui/CommandButton';
import { NumberField } from '@/components/ui/NumberField';
import { StrokePowerSlider } from '@/components/modes/StrokePowerSlider';
import { useLiveSession } from '@/context/SessionProvider';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import { computeStrokeMs } from '@/utils/stroke';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { HardwareCommandError, sendHardwareCommand } from '@/services/hardwareCommand';
import { sendHardwareCommand as sendHardwareCommandRaw } from '@/api/devices';
import { parseStrokeResultJson } from '@/utils/strokeResultJson';
import { parseBurstResultJson } from '@/utils/burstResultJson';
import { ApiError } from '@/api/client';
import {
  clampMaximumStrokeMs,
  clampMinimumStrokeMs,
  normalizeStrokeMsPair,
  resolveStrokeMsBounds,
} from '@/utils/strokeMsLimits';

const MIN_BURST_STROKES = 1;
const MIN_BURST_DELAY_SECONDS = 1;

function clampBurstValue(key: 'burstStrokes' | 'burstDelaySeconds', value: number): number {
  const min = key === 'burstStrokes' ? MIN_BURST_STROKES : MIN_BURST_DELAY_SECONDS;
  return Math.max(min, Number.isFinite(value) ? Math.trunc(value) : min);
}

export function ManualControls() {
  const { settings, updateManual, isLoading, strokeLimits } = useOptions();
  const state = settings.manual;
  const { absoluteMinimum, absoluteMaximum } = resolveStrokeMsBounds(strokeLimits);
  const { selectedSub } = useSubTarget();
  const { expandOnAction } = useVideoDisplay();
  const { recordManualStroke, recordManualBurst, recordManualAbort } = useLiveSession();
  const { isCommandPending } = useHardwareCommand();
  const { status: systemStatus } = useSystemStatus();
  const [commandError, setCommandError] = useState('');

  useEffect(() => {
    setCommandError('');
  }, [selectedSub]);

  useEffect(() => {
    if (systemStatus.isReady) {
      setCommandError('');
    }
  }, [systemStatus.isReady]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const normalizedBurstStrokes = clampBurstValue('burstStrokes', state.burstStrokes);
    const normalizedBurstDelay = clampBurstValue('burstDelaySeconds', state.burstDelaySeconds);
    const normalizedStroke = normalizeStrokeMsPair(
      state.minimumStrokeMs,
      state.maximumStrokeMs,
      strokeLimits,
    );

    const burstValuesValid =
      state.burstStrokes === normalizedBurstStrokes &&
      state.burstDelaySeconds === normalizedBurstDelay;
    const strokeValuesValid =
      state.minimumStrokeMs === normalizedStroke.minimumStrokeMs &&
      state.maximumStrokeMs === normalizedStroke.maximumStrokeMs;

    if (burstValuesValid && strokeValuesValid) {
      return;
    }

    updateManual({
      ...state,
      burstStrokes: normalizedBurstStrokes,
      burstDelaySeconds: normalizedBurstDelay,
      ...normalizedStroke,
    });
  }, [isLoading, state, strokeLimits, updateManual]);

  const strokeMs = useMemo(
    () => computeStrokeMs(state.powerPercent, state.minimumStrokeMs, state.maximumStrokeMs),
    [state.powerPercent, state.minimumStrokeMs, state.maximumStrokeMs],
  );

  const strokePending = isCommandPending(HARDWARE_COMMAND_KEYS.manualStroke);
  const burstPending = isCommandPending(HARDWARE_COMMAND_KEYS.manualBurst);
  const abortPending = isCommandPending(HARDWARE_COMMAND_KEYS.manualAbort);
  const hardwareReady = systemStatus.isReady;
  const strokeDisabledReason = hardwareReady
    ? undefined
    : systemStatus.detail || systemStatus.summary;

  function update<K extends keyof ManualControlState>(key: K, value: ManualControlState[K]) {
    if (key === 'burstStrokes') {
      updateManual({
        ...state,
        burstStrokes: clampBurstValue('burstStrokes', value as number),
      });
      return;
    }

    if (key === 'burstDelaySeconds') {
      updateManual({
        ...state,
        burstDelaySeconds: clampBurstValue('burstDelaySeconds', value as number),
      });
      return;
    }

    if (key === 'minimumStrokeMs') {
      const nextStroke = clampMinimumStrokeMs(Number(value), state.maximumStrokeMs, strokeLimits);
      updateManual({
        ...state,
        ...nextStroke,
      });
      return;
    }

    if (key === 'maximumStrokeMs') {
      updateManual({
        ...state,
        maximumStrokeMs: clampMaximumStrokeMs(Number(value), state.minimumStrokeMs, strokeLimits),
      });
      return;
    }

    updateManual({ ...state, [key]: value });
  }

  function formatCommandError(error: unknown): string {
    if (error instanceof HardwareCommandError) {
      return error.message;
    }

    if (error instanceof ApiError && error.message) {
      return error.message;
    }

    return 'Hardware command failed. Check that the API and device are connected.';
  }

  async function handleStroke() {
    setCommandError('');
    expandOnAction();

    const payloadJson = JSON.stringify({
      powerPercent: state.powerPercent,
      strokeMs,
    });

    try {
      const response = await sendHardwareCommand(selectedSub, 'stroke', payloadJson);
      const parsed = parseStrokeResultJson(response.resultJson);
      await recordManualStroke(state.powerPercent, parsed?.actualStrokeMs);
    } catch (error) {
      if (error instanceof HardwareCommandError) {
        const parsed = parseStrokeResultJson(error.response.resultJson);
        if (parsed?.interrupted) {
          return;
        }
      }
      setCommandError(formatCommandError(error));
    }
  }

  async function handleBurst() {
    setCommandError('');
    expandOnAction();

    const payloadJson = JSON.stringify({
      powerPercent: state.powerPercent,
      strokeMs,
      burstStrokes: state.burstStrokes,
      burstDelayMs: state.burstDelaySeconds * 1000,
    });

    try {
      const response = await sendHardwareCommand(selectedSub, 'burst', payloadJson);
      const parsed = parseBurstResultJson(response.resultJson);
      await recordManualBurst(
        state.powerPercent,
        state.burstStrokes,
        state.burstDelaySeconds,
        parsed?.strokesCompleted,
      );
    } catch (error) {
      if (error instanceof HardwareCommandError) {
        const parsed = parseBurstResultJson(error.response.resultJson);
        if (parsed?.interrupted) {
          if (parsed.strokesCompleted && parsed.strokesCompleted > 0) {
            await recordManualBurst(
              state.powerPercent,
              state.burstStrokes,
              state.burstDelaySeconds,
              parsed.strokesCompleted,
            );
          }
          return;
        }
      }
      setCommandError(formatCommandError(error));
    }
  }

  async function handleAbort() {
    setCommandError('');

    try {
      const response = await sendHardwareCommandRaw(selectedSub, 'abort', '{}');

      if (!response.delivered) {
        setCommandError(response.message ?? 'Abort could not be delivered.');
        return;
      }

      if (!response.acknowledged) {
        setCommandError(response.message ?? 'Device did not acknowledge abort in time.');
        return;
      }

      if (!response.success) {
        setCommandError(response.message ?? 'Nothing to abort.');
        return;
      }

      await recordManualAbort();
    } catch (error) {
      setCommandError(formatCommandError(error));
    }
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading saved manual settings…</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Power Settings" className="min-w-0 overflow-hidden">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-8">
            <NumberField
              label="Minimum Stroke (ms)"
              inline
              value={state.minimumStrokeMs}
              min={absoluteMinimum}
              max={absoluteMaximum}
              className="w-20"
              onChange={(event) => update('minimumStrokeMs', Number(event.target.value))}
            />
            <NumberField
              label="Maximum Stroke (ms)"
              inline
              value={state.maximumStrokeMs}
              min={state.minimumStrokeMs}
              max={absoluteMaximum}
              className="w-20"
              onChange={(event) => update('maximumStrokeMs', Number(event.target.value))}
            />
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-2">
            <StrokePowerSlider
              label="Power"
              percent={state.powerPercent}
              minimumMs={state.minimumStrokeMs}
              maximumMs={state.maximumStrokeMs}
              strokeMs={strokeMs}
              id="manual-power"
              onChange={(event) => update('powerPercent', Number(event.target.value))}
            />
          </div>
        </Panel>

        <Panel title="Actions">
          {!hardwareReady && !commandError && !strokePending && !burstPending ? (
            <p className="mb-3 text-sm text-amber-400/90" role="status">
              {strokeDisabledReason}
            </p>
          ) : null}

          {commandError ? (
            <p className="mb-3 text-sm text-red-400" role="alert">
              {commandError}
            </p>
          ) : null}

          <CommandButton
            commandKey={HARDWARE_COMMAND_KEYS.manualStroke}
            size="lg"
            fullWidth
            className="py-4 text-base"
            disabled={!hardwareReady || burstPending}
            title={strokeDisabledReason}
            onCommand={handleStroke}
          >
            Stroke
          </CommandButton>

          <div
            className="space-y-3 border-t border-slate-600"
            style={{ marginTop: 30, paddingTop: 30 }}
          >
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Burst Strokes"
                value={state.burstStrokes}
                min={MIN_BURST_STROKES}
                disabled={!hardwareReady || strokePending || burstPending}
                onChange={(event) => update('burstStrokes', Number(event.target.value))}
              />
              <NumberField
                label="Burst Delay (sec)"
                value={state.burstDelaySeconds}
                min={MIN_BURST_DELAY_SECONDS}
                disabled={!hardwareReady || strokePending || burstPending}
                onChange={(event) => update('burstDelaySeconds', Number(event.target.value))}
              />
            </div>

            <CommandButton
              commandKey={HARDWARE_COMMAND_KEYS.manualBurst}
              size="lg"
              fullWidth
              className="py-4 text-base"
              disabled={!hardwareReady || strokePending}
              title={strokeDisabledReason}
              onCommand={handleBurst}
            >
              Burst
            </CommandButton>

            <CommandButton
              commandKey={HARDWARE_COMMAND_KEYS.manualAbort}
              size="lg"
              fullWidth
              variant="secondary"
              className="py-4 text-base"
              disabled={(!strokePending && !burstPending) || abortPending}
              onCommand={handleAbort}
            >
              Abort
            </CommandButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}
