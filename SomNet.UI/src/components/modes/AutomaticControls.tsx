import { useEffect, useMemo } from 'react';
import {
  AUTOMATIC_RUN_MODE_OPTIONS,
  type AutomaticControlState,
  type AutomaticRunMode,
  type EndSessionMode,
} from '@/types/modes';
import { useLiveSession } from '@/context/SessionProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
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
  clampMaximumStrokeMs,
  clampMinimumStrokeMs,
  normalizeStrokeMsPair,
  resolveStrokeMsBounds,
} from '@/utils/strokeMsLimits';

const PHASE9_TOOLTIP = 'Automatic hardware mode is coming in Phase 9.';

export function AutomaticControls() {
  const { settings, updateAutomatic, isLoading, strokeLimits } = useOptions();
  const state = settings.automatic;
  const { absoluteMinimum, absoluteMaximum } = resolveStrokeMsBounds(strokeLimits);
  const { expandOnAction } = useVideoDisplay();
  const { beginAutomaticSession, endAutomaticSession } = useLiveSession();

  function update<K extends keyof AutomaticControlState>(
    key: K,
    value: AutomaticControlState[K],
  ) {
    if (key === 'minimumStrokeMs' || key === 'maximumStrokeMs') {
      return;
    }

    updateAutomatic({ ...state, [key]: value });
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
    if (
      normalizedStroke.minimumStrokeMs === state.minimumStrokeMs &&
      normalizedStroke.maximumStrokeMs === state.maximumStrokeMs
    ) {
      return;
    }

    updateAutomatic({
      ...state,
      ...normalizedStroke,
    });
  }, [isLoading, state, strokeLimits, updateAutomatic]);

  function handleStart() {
    update('running', true);
    expandOnAction();
    void beginAutomaticSession();
  }

  function handleStop() {
    update('running', false);
    void endAutomaticSession('stopped manually');
  }

  const endSessionDisabled = state.endSessionMode === 'noAutoEnd';

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

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Power Settings" className="min-w-0 overflow-hidden">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-8">
            <StrokeMsInput
              label="Minimum Stroke (ms)"
              value={state.minimumStrokeMs}
              min={absoluteMinimum}
              max={absoluteMaximum}
              disabled={state.running}
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
              disabled={state.running}
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
            <StrokePowerSlider
              label="Minimum"
              percent={state.minimumPower}
              minimumMs={state.minimumStrokeMs}
              maximumMs={state.maximumStrokeMs}
              strokeMs={minimumStrokeMs}
              disabled={state.running}
              onChange={(event) => update('minimumPower', Number(event.target.value))}
            />
            <StrokePowerSlider
              label="Maximum"
              percent={state.maximumPower}
              minimumMs={state.minimumStrokeMs}
              maximumMs={state.maximumStrokeMs}
              strokeMs={maximumStrokeMs}
              disabled={state.running}
              onChange={(event) => update('maximumPower', Number(event.target.value))}
            />
          </div>
        </Panel>

        <Panel title="Timing Settings">
          <div className="space-y-5">
            <div>
              <p className="mb-3 text-sm font-medium text-slate-300">Time Between Strokes</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <NumberField
                  label="Minimum (sec)"
                  value={state.strokeMinSeconds}
                  min={0}
                  onChange={(event) => update('strokeMinSeconds', Number(event.target.value))}
                />
                <NumberField
                  label="Maximum (sec)"
                  value={state.strokeMaxSeconds}
                  min={0}
                  onChange={(event) => update('strokeMaxSeconds', Number(event.target.value))}
                />
                <NumberField
                  label="Delay Before Start (sec)"
                  value={state.delayBeforeStartSeconds}
                  min={0}
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
                  disabled={endSessionDisabled}
                  className="w-20 text-center"
                  onChange={(event) => update('endSessionValue', Number(event.target.value))}
                />
                <RadioGroup
                  name="endSessionMode"
                  value={state.endSessionMode}
                  options={[
                    { value: 'minutes', label: 'Minutes' },
                    { value: 'strokes', label: 'Strokes' },
                    { value: 'noAutoEnd', label: 'No AutoEnd' },
                  ]}
                  onChange={(value) => update('endSessionMode', value as EndSessionMode)}
                />
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Burst Settings">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <Checkbox
                label="Bursts On"
                checked={state.burstsOn}
                onChange={(event) => update('burstsOn', event.target.checked)}
              />
              <NumberField
                label="Percent (0 to 100)"
                inline
                value={state.burstPercent}
                min={0}
                max={100}
                disabled={!state.burstsOn}
                onChange={(event) => update('burstPercent', Number(event.target.value))}
              />
            </div>

            <SelectField
              label="Burst Style"
              value={state.burstStyle}
              disabled={!state.burstsOn}
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
              disabled={!state.burstsOn}
              onMinChange={(value) => update('burstStrokePowerMin', value)}
              onMaxChange={(value) => update('burstStrokePowerMax', value)}
            />

            <MinMaxRow
              label="Delay Between Burst Strokes in Seconds"
              min={state.burstDelayMin}
              max={state.burstDelayMax}
              minLimit={0}
              disabled={!state.burstsOn}
              onMinChange={(value) => update('burstDelayMin', value)}
              onMaxChange={(value) => update('burstDelayMax', value)}
            />

            <MinMaxRow
              label="Number of Strokes in Each Burst"
              min={state.burstStrokesMin}
              max={state.burstStrokesMax}
              minLimit={1}
              disabled={!state.burstsOn}
              onMinChange={(value) => update('burstStrokesMin', value)}
              onMaxChange={(value) => update('burstStrokesMax', value)}
            />
          </div>
        </Panel>

        <Panel title="Controls">
          <div className="flex h-full flex-col justify-center gap-3">
            <p className="text-xs text-amber-200/90">{PHASE9_TOOLTIP}</p>
            <SelectField
              label="Automatic Mode"
              value={state.automaticMode}
              disabled={state.running}
              options={AUTOMATIC_RUN_MODE_OPTIONS}
              onChange={(event) =>
                update('automaticMode', event.target.value as AutomaticRunMode)
              }
            />
            <CommandButton
              commandKey={HARDWARE_COMMAND_KEYS.automaticStart}
              size="lg"
              fullWidth
              disabled
              title={PHASE9_TOOLTIP}
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
              disabled
              title={PHASE9_TOOLTIP}
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
