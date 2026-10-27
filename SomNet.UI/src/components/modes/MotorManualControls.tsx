import { useEffect, useMemo, useState } from 'react';
import type { MotorManualControlState } from '@/types/motorModes';
import { useControlPanelSettings } from '@/hooks/useControlPanelSettings';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useOperationDeviceId } from '@/context/DeviceOperationScope';
import { useDeviceSceneSessionActive } from '@/hooks/useDeviceSceneSessionActive';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import { isHardwareCommandReady } from '@/utils/commandReadiness';
import { Panel } from '@/components/ui/Panel';
import { CommandButton } from '@/components/ui/CommandButton';
import { MinMaxRow } from '@/components/ui/NumberField';
import { MotorSpeedSlider } from '@/components/modes/MotorSpeedSlider';
import { useOperationSession } from '@/hooks/useOperationSession';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import { computeStrokeMs } from '@/utils/stroke';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { HardwareCommandError, sendHardwareCommand } from '@/services/hardwareCommand';
import { sendHardwareCommand as sendHardwareCommandRaw } from '@/api/devices';
import { parseMotorRunResultJson } from '@/utils/motorRunResultJson';
import { ApiError } from '@/api/client';

export function MotorManualControls() {
  const { settings, updateMotorManual, isLoading, settingsLoaded } = useControlPanelSettings();
  const state = settings.motorManual;
  const { selectedSub } = useSubTarget();
  const commandDeviceId = useOperationDeviceId();
  const sceneSessionActive = useDeviceSceneSessionActive(commandDeviceId);
  const { expandOnAction } = useVideoDisplay();
  const { prepareManualSession, recordManualStroke, recordManualAbort } = useOperationSession();
  const { isCommandPending } = useHardwareCommand();
  const { getDeviceStatus } = useSystemStatus();
  const systemStatus = getDeviceStatus(commandDeviceId);
  const [commandError, setCommandError] = useState('');

  useEffect(() => {
    setCommandError('');
  }, [selectedSub]);

  const dutyPercent = useMemo(
    () =>
      computeStrokeMs(state.speedPercent, state.minimumDutyPercent, state.maximumDutyPercent),
    [state.speedPercent, state.minimumDutyPercent, state.maximumDutyPercent],
  );

  const runSeconds = useMemo(
    () =>
      computeStrokeMs(state.speedPercent, state.minimumRunSeconds, state.maximumRunSeconds),
    [state.speedPercent, state.minimumRunSeconds, state.maximumRunSeconds],
  );

  const runPending = isCommandPending(HARDWARE_COMMAND_KEYS.manualStroke, commandDeviceId);
  const abortPending = isCommandPending(HARDWARE_COMMAND_KEYS.manualAbort, commandDeviceId);
  const hardwareReady = isHardwareCommandReady(systemStatus) && sceneSessionActive;
  const runDisabledReason = !sceneSessionActive
    ? 'Turn Scene session on before Run.'
    : hardwareReady
      ? undefined
      : systemStatus.detail || systemStatus.summary;

  function update<K extends keyof MotorManualControlState>(key: K, value: MotorManualControlState[K]) {
    if (
      key === 'minimumDutyPercent' ||
      key === 'maximumDutyPercent' ||
      key === 'minimumRunSeconds' ||
      key === 'maximumRunSeconds'
    ) {
      return;
    }

    updateMotorManual({ ...state, [key]: value });
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

  async function handleRun() {
    setCommandError('');
    expandOnAction(commandDeviceId);

    const durationMs = runSeconds * 1000;
    const payloadJson = JSON.stringify({
      dutyPercent,
      durationMs,
    });

    try {
      const snapshotActionIndex = await prepareManualSession();
      const response = await sendHardwareCommand(
        selectedSub,
        commandDeviceId,
        'motor-run',
        payloadJson,
        snapshotActionIndex,
      );
      const parsed = parseMotorRunResultJson(response.resultJson);
      await recordManualStroke(
        dutyPercent,
        parsed?.actualDurationMs ?? durationMs,
      );
    } catch (error) {
      if (error instanceof HardwareCommandError) {
        const parsed = parseMotorRunResultJson(error.response.resultJson);
        if (parsed?.interrupted) {
          return;
        }
      }
      setCommandError(formatCommandError(error));
    }
  }

  async function handleAbort() {
    setCommandError('');
    try {
      const response = await sendHardwareCommandRaw(selectedSub, commandDeviceId, 'abort', '{}');
      if (!response.delivered || !response.acknowledged) {
        setCommandError(response.message ?? 'Abort could not be delivered.');
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
      {isLoading || !settingsLoaded ? (
        <p className="text-sm text-slate-500">Loading saved motor manual settings…</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Speed settings" className="min-w-0 overflow-hidden">
          <MinMaxRow
            label="Duty %"
            min={state.minimumDutyPercent}
            max={state.maximumDutyPercent}
            minLimit={0}
            maxLimit={100}
            onMinChange={(value) =>
              updateMotorManual({
                ...state,
                minimumDutyPercent: value,
                maximumDutyPercent: Math.max(value, state.maximumDutyPercent),
              })
            }
            onMaxChange={(value) =>
              updateMotorManual({
                ...state,
                maximumDutyPercent: value,
                minimumDutyPercent: Math.min(value, state.minimumDutyPercent),
              })
            }
          />

          <MinMaxRow
            label="Run (sec)"
            min={state.minimumRunSeconds}
            max={state.maximumRunSeconds}
            minLimit={1}
            maxLimit={3600}
            minValueMin={1}
            onMinChange={(value) =>
              updateMotorManual({
                ...state,
                minimumRunSeconds: value,
                maximumRunSeconds: Math.max(value, state.maximumRunSeconds),
              })
            }
            onMaxChange={(value) =>
              updateMotorManual({
                ...state,
                maximumRunSeconds: value,
                minimumRunSeconds: Math.min(value, state.minimumRunSeconds),
              })
            }
          />

          <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-2">
            <MotorSpeedSlider
              label="Speed"
              percent={state.speedPercent}
              minimumDuty={state.minimumDutyPercent}
              maximumDuty={state.maximumDutyPercent}
              dutyPercent={dutyPercent}
              minimumRunSeconds={state.minimumRunSeconds}
              maximumRunSeconds={state.maximumRunSeconds}
              runSeconds={runSeconds}
              id="motor-manual-speed"
              onChange={(event) => update('speedPercent', Number(event.target.value))}
            />
          </div>
        </Panel>

        <Panel title="Actions">
          {!hardwareReady && !commandError && !runPending ? (
            <p className="mb-3 text-sm text-amber-400/90" role="status">
              {runDisabledReason}
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
            disabled={!hardwareReady}
            title={runDisabledReason}
            onCommand={handleRun}
          >
            Run
          </CommandButton>

          <CommandButton
            commandKey={HARDWARE_COMMAND_KEYS.manualAbort}
            size="lg"
            fullWidth
            variant="secondary"
            className="mt-4 py-4 text-base"
            disabled={!runPending || abortPending}
            onCommand={handleAbort}
          >
            Abort
          </CommandButton>
        </Panel>
      </div>
    </div>
  );
}
