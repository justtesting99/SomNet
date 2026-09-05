import { useMemo, useState } from 'react';
import { type ManualControlState } from '@/types/modes';
import { useOptions } from '@/context/OptionsProvider';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { Panel } from '@/components/ui/Panel';
import { CommandButton } from '@/components/ui/CommandButton';
import { NumberField } from '@/components/ui/NumberField';
import { StrokePowerSlider } from '@/components/modes/StrokePowerSlider';
import { useLiveSession } from '@/context/SessionProvider';
import { computeStrokeMs } from '@/utils/stroke';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';

export function ManualControls() {
  const { settings, updateManual, isLoading } = useOptions();
  const state = settings.manual;
  const [burstInProgress, setBurstInProgress] = useState(false);
  const { expandOnAction } = useVideoDisplay();
  const { recordManualStroke, recordManualBurst, endManualSession } = useLiveSession();

  const strokeMs = useMemo(
    () => computeStrokeMs(state.powerPercent, state.minimumStrokeMs, state.maximumStrokeMs),
    [state.powerPercent, state.minimumStrokeMs, state.maximumStrokeMs],
  );

  function update<K extends keyof ManualControlState>(key: K, value: ManualControlState[K]) {
    updateManual({ ...state, [key]: value });
  }

  function handleStroke() {
    setBurstInProgress(false);
    expandOnAction();
    void recordManualStroke(state.powerPercent);
  }

  function handleBurst() {
    setBurstInProgress(true);
    expandOnAction();
    void recordManualBurst(state.powerPercent, state.burstStrokes, state.burstDelaySeconds);
  }

  function handleAbort() {
    setBurstInProgress(false);
    void endManualSession('abort');
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
              min={1}
              className="w-20"
              onChange={(event) => update('minimumStrokeMs', Number(event.target.value))}
            />
            <NumberField
              label="Maximum Stroke (ms)"
              inline
              value={state.maximumStrokeMs}
              min={1}
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
          <CommandButton
            commandKey={HARDWARE_COMMAND_KEYS.manualStroke}
            size="lg"
            fullWidth
            className="py-4 text-base"
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
                min={1}
                onChange={(event) => update('burstStrokes', Number(event.target.value))}
              />
              <NumberField
                label="Burst Delay (sec)"
                value={state.burstDelaySeconds}
                min={0}
                onChange={(event) => update('burstDelaySeconds', Number(event.target.value))}
              />
            </div>

            <CommandButton
              commandKey={HARDWARE_COMMAND_KEYS.manualBurst}
              size="lg"
              fullWidth
              className="py-4 text-base"
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
              disabled={!burstInProgress}
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
