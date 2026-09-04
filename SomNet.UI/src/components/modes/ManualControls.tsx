import { useMemo, useState } from 'react';
import { defaultManualState, type ManualControlState } from '@/types/modes';
import { computeStrokeMs } from '@/utils/stroke';
import { useLiveSession } from '@/context/SessionProvider';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { NumberField } from '@/components/ui/NumberField';
import { ManualPowerSlider } from '@/components/modes/ManualPowerSlider';

export function ManualControls() {
  const [state, setState] = useState<ManualControlState>(defaultManualState);
  const [burstInProgress, setBurstInProgress] = useState(false);
  const { expandOnAction } = useVideoDisplay();
  const { recordManualStroke, recordManualBurst, endManualSession } = useLiveSession();

  const strokeMs = useMemo(
    () => computeStrokeMs(state.powerPercent, state.minimumStrokeMs, state.maximumStrokeMs),
    [state.powerPercent, state.minimumStrokeMs, state.maximumStrokeMs],
  );

  function update<K extends keyof ManualControlState>(key: K, value: ManualControlState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function handleStroke() {
    setBurstInProgress(false);
    expandOnAction();
    void recordManualStroke(state.burstStrokes, state.burstDelaySeconds);
  }

  function handleBurst() {
    setBurstInProgress(true);
    expandOnAction();
    void recordManualBurst(state.burstStrokes, state.burstDelaySeconds);
  }

  function handleAbort() {
    setBurstInProgress(false);
    void endManualSession('abort');
  }

  return (
    <div className="space-y-4">
      <Panel title="Master Settings">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-8">
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
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Power">
          <ManualPowerSlider
            percent={state.powerPercent}
            minimumMs={state.minimumStrokeMs}
            maximumMs={state.maximumStrokeMs}
            strokeMs={strokeMs}
            onChange={(event) => update('powerPercent', Number(event.target.value))}
          />
        </Panel>

        <Panel title="Actions">
          <div className="flex flex-col gap-3">
            <Button size="lg" fullWidth className="py-4 text-base" onClick={handleStroke}>
              Stroke
            </Button>

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

            <Button size="lg" fullWidth className="py-4 text-base" onClick={handleBurst}>
              Burst
            </Button>

            <Button
              size="lg"
              fullWidth
              variant="secondary"
              className="py-4 text-base"
              disabled={!burstInProgress}
              onClick={handleAbort}
            >
              Abort
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
