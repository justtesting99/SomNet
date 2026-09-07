import { useEffect, useMemo, useState } from 'react';
import {
  AUTOMATIC_RUN_MODE_OPTIONS,
  type AutomaticControlState,
  type AutomaticRunMode,
  type EndSessionMode,
} from '@/types/modes';
import { useLiveSession } from '@/context/SessionProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import { Panel } from '@/components/ui/Panel';
import { CommandButton } from '@/components/ui/CommandButton';
import { StrokePowerSlider } from '@/components/modes/StrokePowerSlider';
import { NumberField, MinMaxRow } from '@/components/ui/NumberField';
import { StrokeMsInput } from '@/components/modes/StrokeMsInput';
import { Checkbox } from '@/components/ui/Checkbox';
import { RadioGroup, SelectField } from '@/components/ui/RadioGroup';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { computeStrokeMs } from '@/utils/stroke';
import {
  applyAutomaticModeChange,
  getAutomaticFieldRules,
  normalizeAutomaticControlState,
} from '@/utils/automaticFieldRules';
import { getAutomaticModeInfo } from '@/utils/automaticModeInfo';
import {
  clampMaximumStrokeMs,
  clampMinimumStrokeMs,
  normalizeStrokeMsPair,
  resolveStrokeMsBounds,
} from '@/utils/strokeMsLimits';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import { HardwareCommandError, sendHardwareCommand } from '@/services/hardwareCommand';
import { buildAutomaticStartPayload } from '@/utils/automaticStartPayload';
import { parseAutomaticResultJson } from '@/utils/automaticResultJson';
import { ApiError } from '@/api/client';

const END_SESSION_OPTIONS: { value: EndSessionMode; label: string }[] = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'strokes', label: 'Strokes' },
  { value: 'noAutoEnd', label: 'No AutoEnd' },
];

export function AutomaticControls() {
  const { settings, updateAutomatic, isLoading, strokeLimits } = useOptions();
  const state = settings.automatic;
  const { absoluteMinimum, absoluteMaximum } = resolveStrokeMsBounds(strokeLimits);
  const { selectedSub } = useSubTarget();
  const { expandOnAction } = useVideoDisplay();
  const { beginAutomaticSession, endAutomaticSession } = useLiveSession();
  const { isCommandPending } = useHardwareCommand();
  const { status: systemStatus } = useSystemStatus();
  const [commandError, setCommandError] = useState('');

  const fieldRules = useMemo(
    () => getAutomaticFieldRules(state.automaticMode),
    [state.automaticMode],
  );

  const modeInfo = useMemo(
    () => getAutomaticModeInfo(state.automaticMode),
    [state.automaticMode],
  );

  const configLocked = state.running;
  const hardwareReady = systemStatus.isReady;
  const startPending = isCommandPending(HARDWARE_COMMAND_KEYS.automaticStart);
  const stopPending = isCommandPending(HARDWARE_COMMAND_KEYS.automaticStop);
  const hardwareDisabledReason = hardwareReady
    ? undefined
    : systemStatus.detail || systemStatus.summary;

  useEffect(() => {
    setCommandError('');
  }, [selectedSub]);

  useEffect(() => {
    if (systemStatus.isReady) {
      setCommandError('');
    }
  }, [systemStatus.isReady]);

  function update<K extends keyof AutomaticControlState>(
    key: K,
    value: AutomaticControlState[K],
  ) {
    if (key === 'minimumStrokeMs' || key === 'maximumStrokeMs') {
      return;
    }

    updateAutomatic({ ...state, [key]: value });
  }

  function handleAutomaticModeChange(nextMode: AutomaticRunMode) {
    updateAutomatic(applyAutomaticModeChange(state, nextMode));
  }

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const normalizedStroke = normalizeStrokeMsPair(
      state.minimumStrokeMs,
      state.maximumStrokeMs,
      strokeLimits,
    );
    const normalizedAutomatic = normalizeAutomaticControlState({
      ...state,
      ...normalizedStroke,
    });

    const strokeUnchanged =
      normalizedStroke.minimumStrokeMs === state.minimumStrokeMs &&
      normalizedStroke.maximumStrokeMs === state.maximumStrokeMs;
    const automaticUnchanged =
      normalizedAutomatic.automaticMode === state.automaticMode &&
      normalizedAutomatic.endSessionMode === state.endSessionMode;

    if (strokeUnchanged && automaticUnchanged) {
      return;
    }

    updateAutomatic(normalizedAutomatic);
  }, [isLoading, state, strokeLimits, updateAutomatic]);

  function formatCommandError(error: unknown): string {
    if (error instanceof HardwareCommandError) {
      return error.message;
    }

    if (error instanceof ApiError && error.message) {
      return error.message;
    }

    return 'Hardware command failed. Check that the API and device are connected.';
  }

  async function handleStart() {
    setCommandError('');
    expandOnAction();

    const payloadJson = buildAutomaticStartPayload(state);

    try {
      await sendHardwareCommand(
        selectedSub,
        HARDWARE_COMMAND_KEYS.automaticStart,
        payloadJson,
      );
      update('running', true);
      await beginAutomaticSession();
    } catch (error) {
      setCommandError(formatCommandError(error));
    }
  }

  async function handleStop() {
    setCommandError('');

    try {
      const response = await sendHardwareCommand(
        selectedSub,
        HARDWARE_COMMAND_KEYS.automaticStop,
        '{}',
      );
      const parsed = parseAutomaticResultJson(response.resultJson);
      update('running', false);
      await endAutomaticSession('stopped manually', parsed);
    } catch (error) {
      setCommandError(formatCommandError(error));
    }
  }

  const endSessionValueDisabled = configLocked || state.endSessionMode === 'noAutoEnd';

  const endSessionOptions = useMemo(
    () =>
      END_SESSION_OPTIONS.map((option) => ({
        ...option,
        disabled: option.value === 'noAutoEnd' ? fieldRules.disableNoAutoEnd : false,
      })),
    [fieldRules.disableNoAutoEnd],
  );

  const minimumStrokeMs = useMemo(
    () => computeStrokeMs(state.minimumPower, state.minimumStrokeMs, state.maximumStrokeMs),
    [state.minimumPower, state.minimumStrokeMs, state.maximumStrokeMs],
  );

  const maximumStrokeMs = useMemo(
    () => computeStrokeMs(state.maximumPower, state.minimumStrokeMs, state.maximumStrokeMs),
    [state.maximumPower, state.minimumStrokeMs, state.maximumStrokeMs],
  );

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading saved automatic settings…</p>
      ) : null}

      {configLocked ? (
        <p className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
          Session running — settings are read-only until you stop.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Power Settings" className="min-w-0 overflow-hidden">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-8">
            <StrokeMsInput
              label="Minimum Stroke (ms)"
              value={state.minimumStrokeMs}
              min={absoluteMinimum}
              max={absoluteMaximum}
              disabled={configLocked}
              onCommit={(nextMin) => {
                const nextStroke = clampMinimumStrokeMs(
                  nextMin,
                  state.maximumStrokeMs,
                  strokeLimits,
                );
                updateAutomatic({
                  ...state,
                  ...nextStroke,
                });
              }}
            />
            <StrokeMsInput
              label="Maximum Stroke (ms)"
              value={state.maximumStrokeMs}
              min={state.minimumStrokeMs}
              max={absoluteMaximum}
              disabled={configLocked}
              onCommit={(nextMax) => {
                updateAutomatic({
                  ...state,
                  maximumStrokeMs: clampMaximumStrokeMs(
                    nextMax,
                    state.minimumStrokeMs,
                    strokeLimits,
                  ),
                });
              }}
            />
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-2">
            <div className="space-y-1">
              <StrokePowerSlider
                label="Minimum Power"
                percent={state.minimumPower}
                minimumMs={state.minimumStrokeMs}
                maximumMs={state.maximumStrokeMs}
                strokeMs={minimumStrokeMs}
                disabled={configLocked || fieldRules.disableMinimumPower}
                title={
                  fieldRules.disableMinimumPower
                    ? 'Not used in this automatic mode — device uses maximum power'
                    : undefined
                }
                onChange={(event) => update('minimumPower', Number(event.target.value))}
              />
              {fieldRules.disableMinimumPower && !configLocked ? (
                <p className="text-center text-xs text-slate-500 sm:text-left">
                  Not used — device uses maximum power.
                </p>
              ) : null}
            </div>
            <StrokePowerSlider
              label="Maximum Power"
              percent={state.maximumPower}
              minimumMs={state.minimumStrokeMs}
              maximumMs={state.maximumStrokeMs}
              strokeMs={maximumStrokeMs}
              disabled={configLocked}
              onChange={(event) => update('maximumPower', Number(event.target.value))}
            />
          </div>
        </Panel>

        <Panel title="Timing Settings">
          <div className="space-y-5">
            <div>
              <p className="mb-3 text-sm font-medium text-slate-300">Time Between Strokes</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <NumberField
                    label="Minimum (sec)"
                    alignLabelHeight
                    value={state.strokeMinSeconds}
                    min={0}
                    disabled={configLocked || fieldRules.disableStrokeMinSeconds}
                    title={
                      fieldRules.disableStrokeMinSeconds
                        ? 'Not used in this automatic mode — device uses maximum interval'
                        : undefined
                    }
                    onChange={(event) => update('strokeMinSeconds', Number(event.target.value))}
                  />
                  {fieldRules.disableStrokeMinSeconds && !configLocked ? (
                    <p className="text-xs text-slate-500">Not used — device uses maximum gap.</p>
                  ) : null}
                </div>
                <NumberField
                  label="Maximum (sec)"
                  alignLabelHeight
                  value={state.strokeMaxSeconds}
                  min={0}
                  disabled={configLocked}
                  onChange={(event) => update('strokeMaxSeconds', Number(event.target.value))}
                />
                <NumberField
                  label="Delay Before Start (sec)"
                  alignLabelHeight
                  value={state.delayBeforeStartSeconds}
                  min={0}
                  disabled={configLocked}
                  onChange={(event) =>
                    update('delayBeforeStartSeconds', Number(event.target.value))
                  }
                />
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-slate-300">End Session After</p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <NumberField
                  value={state.endSessionValue}
                  min={0}
                  disabled={endSessionValueDisabled}
                  className="w-20 text-center"
                  onChange={(event) => update('endSessionValue', Number(event.target.value))}
                />
                <RadioGroup
                  name="endSessionMode"
                  value={state.endSessionMode}
                  disabled={configLocked}
                  options={endSessionOptions}
                  onChange={(value) => update('endSessionMode', value as EndSessionMode)}
                />
              </div>
              {modeInfo.endSessionNote && !configLocked ? (
                <p className="mt-2 text-xs text-slate-500">{modeInfo.endSessionNote}</p>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel title="Burst Settings">
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Burst-in-automatic — Part 3 (not yet available).</p>
            <div className="flex flex-wrap items-center gap-4">
              <Checkbox
                label="Bursts On"
                checked={state.burstsOn}
                disabled
                onChange={(event) => update('burstsOn', event.target.checked)}
              />
              <NumberField
                label="Percent (0 to 100)"
                inline
                value={state.burstPercent}
                min={0}
                max={100}
                disabled
                onChange={(event) => update('burstPercent', Number(event.target.value))}
              />
            </div>

            <SelectField
              label="Burst Style"
              value={state.burstStyle}
              disabled
              options={[{ value: 'fixedPowerDelay', label: 'Fixed Power/Delay' }]}
              onChange={(event) =>
                update('burstStyle', event.target.value as AutomaticControlState['burstStyle'])
              }
            />

            <MinMaxRow
              label="Burst Stroke Power in Percent (0 to 100)"
              min={state.burstStrokePowerMin}
              max={state.burstStrokePowerMax}
              minLimit={0}
              maxLimit={100}
              disabled
              onMinChange={(value) => update('burstStrokePowerMin', value)}
              onMaxChange={(value) => update('burstStrokePowerMax', value)}
            />

            <MinMaxRow
              label="Delay Between Burst Strokes in Seconds"
              min={state.burstDelayMin}
              max={state.burstDelayMax}
              minLimit={0}
              disabled
              onMinChange={(value) => update('burstDelayMin', value)}
              onMaxChange={(value) => update('burstDelayMax', value)}
            />

            <MinMaxRow
              label="Number of Strokes in Each Burst"
              min={state.burstStrokesMin}
              max={state.burstStrokesMax}
              minLimit={1}
              disabled
              onMinChange={(value) => update('burstStrokesMin', value)}
              onMaxChange={(value) => update('burstStrokesMax', value)}
            />
          </div>
        </Panel>

        <Panel title="Controls">
          <div className="flex h-full flex-col justify-center gap-3">
            {!hardwareReady && !commandError && !startPending && !stopPending ? (
              <p className="text-sm text-amber-400/90" role="status">
                {hardwareDisabledReason}
              </p>
            ) : null}

            {commandError ? (
              <p className="text-sm text-red-400" role="alert">
                {commandError}
              </p>
            ) : null}

            <SelectField
              label="Automatic Mode"
              value={state.automaticMode}
              disabled={configLocked}
              options={AUTOMATIC_RUN_MODE_OPTIONS}
              onChange={(event) =>
                handleAutomaticModeChange(event.target.value as AutomaticRunMode)
              }
            />
            <p className="text-xs leading-relaxed text-slate-500">{modeInfo.summary}</p>
            <CommandButton
              commandKey={HARDWARE_COMMAND_KEYS.automaticStart}
              size="lg"
              fullWidth
              disabled={!hardwareReady || configLocked || stopPending}
              title={hardwareDisabledReason}
              onCommand={handleStart}
              className="py-4 text-base"
            >
              Start
            </CommandButton>
            <CommandButton
              commandKey={HARDWARE_COMMAND_KEYS.automaticStop}
              size="lg"
              fullWidth
              variant="secondary"
              disabled={!hardwareReady || !configLocked || startPending}
              title={hardwareDisabledReason}
              onCommand={handleStop}
              className="py-4 text-base"
            >
              Stop
            </CommandButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}
