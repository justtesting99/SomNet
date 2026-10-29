import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ClampedNumberField } from '@/components/ui/ClampedNumberField';
import { MotorSpeedSlider } from '@/components/modes/MotorSpeedSlider';
import { useOperationSession } from '@/hooks/useOperationSession';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import { computeStrokeMs } from '@/utils/stroke';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { HardwareCommandError, sendHardwareCommand } from '@/services/hardwareCommand';
import { sendHardwareCommand as sendHardwareCommandRaw } from '@/api/devices';
import { ApiError } from '@/api/client';
import { useAuth } from '@/context/AuthProvider';
import { pushDeviceSceneSessionIfWanted } from '@/utils/pushDeviceSceneSessionIfWanted';

const DUTY_MIN = 0;
const DUTY_MAX = 100;

interface ActiveManualRun {
  dutyPercent: number;
  startedAtMs: number;
}

function clampDuty(value: number): number {
  return Math.max(DUTY_MIN, Math.min(DUTY_MAX, Math.trunc(value)));
}

export function MotorManualControls() {
  const { settings, updateMotorManual, isLoading } = useControlPanelSettings();
  const { user } = useAuth();
  const domTarget = user?.displayName ?? user?.username ?? '';
  const state = settings.motorManual;
  const { selectedSub } = useSubTarget();
  const commandDeviceId = useOperationDeviceId();
  const sceneSessionActive = useDeviceSceneSessionActive(commandDeviceId);
  const { expandOnAction } = useVideoDisplay();
  const { prepareManualSession, recordManualStroke, recordManualAbort } = useOperationSession();
  const { isCommandPending } = useHardwareCommand();
  const { getDeviceStatus } = useSystemStatus();
  const systemStatus = getDeviceStatus(commandDeviceId);
  const sceneSessionError = '';
  const accessoryError = '';
  const [commandError, setCommandError] = useState('');
  const [motorRunning, setMotorRunning] = useState(false);
  const activeRunRef = useRef<ActiveManualRun | null>(null);

  useEffect(() => {
    setCommandError('');
  }, [selectedSub]);

  useEffect(() => {
    setMotorRunning(false);
    activeRunRef.current = null;
  }, [selectedSub, commandDeviceId]);

  useEffect(() => {
    if (systemStatus.isReady) {
      setCommandError('');
    }
  }, [systemStatus.isReady]);

  const dutyPercent = useMemo(
    () =>
      computeStrokeMs(state.speedPercent, state.minimumDutyPercent, state.maximumDutyPercent),
    [state.speedPercent, state.minimumDutyPercent, state.maximumDutyPercent],
  );

  const startPending = isCommandPending(HARDWARE_COMMAND_KEYS.manualStroke, commandDeviceId);
  const stopPending = isCommandPending(HARDWARE_COMMAND_KEYS.manualMotorStop, commandDeviceId);
  const abortPending = isCommandPending(HARDWARE_COMMAND_KEYS.manualAbort, commandDeviceId);
  const hardwareReady = isHardwareCommandReady(systemStatus) && sceneSessionActive;
  const motionPending = startPending || stopPending;
  const startDisabledReason = !sceneSessionActive
    ? 'Turn Scene session on before start or stop.'
    : motorRunning
      ? 'Stop the motor before starting again.'
      : hardwareReady
        ? undefined
        : systemStatus.detail || systemStatus.summary;

  function update<K extends keyof MotorManualControlState>(key: K, value: MotorManualControlState[K]) {
    if (key === 'minimumDutyPercent' || key === 'maximumDutyPercent') {
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

  async function handleStart() {
    setCommandError('');
    expandOnAction(commandDeviceId);

    const payloadJson = JSON.stringify({ dutyPercent });

    try {
      await pushDeviceSceneSessionIfWanted(domTarget, selectedSub, commandDeviceId);
      await sendHardwareCommand(selectedSub, commandDeviceId, 'motor-run', payloadJson);
      activeRunRef.current = { dutyPercent, startedAtMs: Date.now() };
      setMotorRunning(true);
    } catch (error) {
      setCommandError(formatCommandError(error));
    }
  }

  async function handleStop() {
    setCommandError('');
    const activeRun = activeRunRef.current;
    if (!activeRun) {
      return;
    }

    const dutyForHistory = activeRun.dutyPercent;
    const elapsedMs = Math.max(0, Date.now() - activeRun.startedAtMs);

    try {
      const snapshotActionIndex = await prepareManualSession();
      await sendHardwareCommand(
        selectedSub,
        commandDeviceId,
        'motor-stop',
        '{}',
        snapshotActionIndex,
      );
      activeRunRef.current = null;
      setMotorRunning(false);
      void recordManualStroke(dutyForHistory, elapsedMs).catch((error) => {
        setCommandError(formatCommandError(error));
      });
    } catch (error) {
      setCommandError(formatCommandError(error));
    }
  }

  async function handleAbort() {
    setCommandError('');

    try {
      const response = await sendHardwareCommandRaw(selectedSub, commandDeviceId, 'abort', '{}');

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

      if (activeRunRef.current) {
        await recordManualAbort();
      }
      activeRunRef.current = null;
      setMotorRunning(false);
    } catch (error) {
      setCommandError(formatCommandError(error));
    }
  }

  const settingsLocked = motorRunning || motionPending;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading saved manual settings…</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Speed Settings" className="min-w-0 overflow-hidden">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-8">
            <ClampedNumberField
              label="Minimum Duty (%)"
              value={state.minimumDutyPercent}
              min={DUTY_MIN}
              max={DUTY_MAX}
              disabled={settingsLocked}
              onCommit={(nextMin) => {
                const minimumDutyPercent = clampDuty(nextMin);
                updateMotorManual({
                  ...state,
                  minimumDutyPercent,
                  maximumDutyPercent: Math.max(minimumDutyPercent, state.maximumDutyPercent),
                });
              }}
            />
            <ClampedNumberField
              label="Maximum Duty (%)"
              value={state.maximumDutyPercent}
              min={state.minimumDutyPercent}
              max={DUTY_MAX}
              disabled={settingsLocked}
              onCommit={(nextMax) => {
                const maximumDutyPercent = clampDuty(nextMax);
                updateMotorManual({
                  ...state,
                  maximumDutyPercent,
                  minimumDutyPercent: Math.min(maximumDutyPercent, state.minimumDutyPercent),
                });
              }}
            />
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-2">
            <MotorSpeedSlider
              label="Speed"
              percent={state.speedPercent}
              minimumDuty={state.minimumDutyPercent}
              maximumDuty={state.maximumDutyPercent}
              dutyPercent={dutyPercent}
              id="motor-manual-speed"
              disabled={settingsLocked}
              onChange={(event) => update('speedPercent', Number(event.target.value))}
            />
          </div>
        </Panel>

        <Panel title="Actions">
          {accessoryError || sceneSessionError ? (
            <p className="mb-3 text-sm text-red-400" role="alert">
              {accessoryError || sceneSessionError}
            </p>
          ) : null}
          {!hardwareReady && !commandError && !startPending && !stopPending ? (
            <p className="mb-3 text-sm text-amber-400/90" role="status">
              {startDisabledReason}
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
            disabled={!hardwareReady || motorRunning || stopPending}
            title={startDisabledReason}
            onCommand={handleStart}
          >
            Start
          </CommandButton>

          <div
            className="space-y-3 border-t border-slate-600"
            style={{ marginTop: 30, paddingTop: 30 }}
          >
            <CommandButton
              commandKey={HARDWARE_COMMAND_KEYS.manualMotorStop}
              size="lg"
              fullWidth
              className="py-4 text-base"
              disabled={!hardwareReady || !motorRunning || startPending}
              title={motorRunning ? undefined : 'Start the motor before stopping.'}
              onCommand={handleStop}
            >
              Stop
            </CommandButton>

            <CommandButton
              commandKey={HARDWARE_COMMAND_KEYS.manualAbort}
              size="lg"
              fullWidth
              variant="secondary"
              className="py-4 text-base"
              disabled={(!startPending && !motorRunning) || abortPending}
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
