import { useState } from 'react';
import {
  defaultAutomaticState,
  AUTOMATIC_RUN_MODE_OPTIONS,
  type AutomaticControlState,
  type AutomaticRunMode,
  type EndSessionMode,
} from '@/types/modes';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { VerticalRangeControl } from '@/components/ui/VerticalRangeControl';
import { NumberField, MinMaxRow } from '@/components/ui/NumberField';
import { Checkbox } from '@/components/ui/Checkbox';
import { RadioGroup, SelectField } from '@/components/ui/RadioGroup';

export function AutomaticControls() {
  const [state, setState] = useState<AutomaticControlState>(defaultAutomaticState);
  const { expandOnAction } = useVideoDisplay();

  function update<K extends keyof AutomaticControlState>(
    key: K,
    value: AutomaticControlState[K],
  ) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function handleStart() {
    update('running', true);
    expandOnAction();
  }

  function handleStop() {
    update('running', false);
  }

  const endSessionDisabled = state.endSessionMode === 'noAutoEnd';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Power Settings */}
        <Panel title="Power Settings" className="min-w-0 overflow-hidden">
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4">
            <VerticalRangeControl
              label="Minimum"
              min={0}
              max={400}
              value={state.minimumPower}
              scaleTop={400}
              scaleBottom={0}
              onChange={(event) => update('minimumPower', Number(event.target.value))}
            />
            <VerticalRangeControl
              label="Maximum"
              min={0}
              max={400}
              value={state.maximumPower}
              scaleTop={400}
              scaleBottom={0}
              onChange={(event) => update('maximumPower', Number(event.target.value))}
            />
          </div>
        </Panel>

        {/* Timing Settings */}
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

        {/* Burst Settings */}
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

        {/* Start / Stop */}
        <Panel title="Controls">
          <div className="flex h-full flex-col justify-center gap-3">
            <SelectField
              label="Automatic Mode"
              value={state.automaticMode}
              disabled={state.running}
              options={AUTOMATIC_RUN_MODE_OPTIONS}
              onChange={(event) =>
                update('automaticMode', event.target.value as AutomaticRunMode)
              }
            />
            <Button
              size="lg"
              fullWidth
              disabled={state.running}
              onClick={handleStart}
              className="py-4 text-base"
            >
              Start
            </Button>
            <Button
              size="lg"
              fullWidth
              variant="secondary"
              disabled={!state.running}
              onClick={handleStop}
              className="py-4 text-base"
            >
              Stop
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
