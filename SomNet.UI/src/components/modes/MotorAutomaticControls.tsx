import { useEffect, useRef, useState } from 'react';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import { useSessionAccessory } from '@/context/SessionAccessoryProvider';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { Panel } from '@/components/ui/Panel';
import { CommandButton } from '@/components/ui/CommandButton';
import { NumberField, MinMaxRow } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/RadioGroup';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import { sendHardwareCommand as sendHardwareCommandRaw } from '@/api/devices';
import { useOptions } from '@/context/OptionsProvider';
import { buildMotorAutomaticStartPayload } from '@/utils/motorAutomaticStartPayload';
import type { MotorAutomaticControlState } from '@/types/motorModes';
import type { EndSessionMode } from '@/types/modes';
import { parseAutomaticResultJson } from '@/utils/automaticResultJson';
import { waitForAutomaticHubFinalize } from '@/utils/automaticSessionFinalize';
import { isDeviceAutomaticIdleMessage } from '@/utils/automaticSessionReconcile';
import { writeAutomaticDeviceRunningHint } from '@/utils/automaticDeviceRunningHint';
import { ApiError } from '@/api/client';
import { HardwareCommandError, sendHardwareCommand } from '@/services/hardwareCommand';
const MOTOR_STOP_GRACE_MS = 60_000;

const END_SESSION_OPTIONS: { value: EndSessionMode; label: string }[] = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'noAutoEnd', label: 'No AutoEnd' },
];

export function MotorAutomaticControls() {
  const { settings, updateMotorAutomatic, setMotorAutomaticRunningLocal } = useOptions();
  const state = settings.motorAutomatic;
  const { selectedSub } = useSubTarget();
  const { expandOnAction } = useVideoDisplay();
  const { endAutomaticSession, activeSession, markAutomaticDeviceStarted } = useLiveSession();
  const { isCommandPending } = useHardwareCommand();
  const { status: systemStatus } = useSystemStatus();
  const { sessionInProgress, sessionAccessoryError } = useSessionAccessory();
  const [commandError, setCommandError] = useState('');
  const [cooperativeStopInProgress, setCooperativeStopInProgress] = useState(false);
  const runningRef = useRef(state.running);
  const activeSessionRef = useRef(activeSession);
  runningRef.current = state.running;
  activeSessionRef.current = activeSession;

  const automaticSessionActive = activeSession?.mode === 'automatic';
  const sessionRunning = state.running;
  const configLocked = sessionRunning;
  const hardwareReady = systemStatus.isReady && sessionInProgress;
  const startPending = isCommandPending(HARDWARE_COMMAND_KEYS.automaticStart);
  const stopPending = isCommandPending(HARDWARE_COMMAND_KEYS.automaticStop);
  const abortPending = isCommandPending(HARDWARE_COMMAND_KEYS.manualAbort);
  const hardwareDisabledReason = !sessionInProgress
    ? 'Turn Session in Progress on before Start.'
    : hardwareReady
      ? undefined
      : systemStatus.detail || systemStatus.summary;

  useEffect(() => {
    if (!automaticSessionActive && !state.running) {
      setCooperativeStopInProgress(false);
    }
  }, [automaticSessionActive, state.running]);

  useEffect(() => {
    setCommandError('');
  }, [selectedSub]);

  function update<K extends keyof MotorAutomaticControlState>(key: K, value: MotorAutomaticControlState[K]) {
    if (configLocked && key !== 'running') {
      return;
    }
    updateMotorAutomatic({ ...state, [key]: value });
  }

  function setRunningLocal(running: boolean) {
    setMotorAutomaticRunningLocal(running);
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

  async function finalizeStaleRehydratedSession(message?: string | null) {
    if (!automaticSessionActive) {
      return false;
    }
    const normalized = (message ?? '').toLowerCase();
    if (
      !isDeviceAutomaticIdleMessage(message) &&
      !normalized.includes('nothing to stop') &&
      !normalized.includes('nothing to abort')
    ) {
      return false;
    }
    setRunningLocal(false);
    await endAutomaticSession('stopped manually (device already idle)');
    return true;
  }

  async function handleStart() {
    setCommandError('');
    expandOnAction();
    const payloadJson = buildMotorAutomaticStartPayload(state);
    try {
      await sendHardwareCommand(selectedSub, HARDWARE_COMMAND_KEYS.automaticStart, payloadJson);
      markAutomaticDeviceStarted();
      const sessionId = activeSessionRef.current?.id;
      if (sessionId) {
        writeAutomaticDeviceRunningHint({ sessionId, subTarget: selectedSub });
      }
      setRunningLocal(true);
    } catch (error) {
      setCommandError(formatCommandError(error));
    }
  }

  function isAutomaticSessionPendingFinalize(): boolean {
    return runningRef.current || activeSessionRef.current?.mode === 'automatic';
  }

  async function handleStop() {
    setCommandError('');
    const wasRunning = automaticSessionActive || state.running;
    try {
      const response = await sendHardwareCommandRaw(
        selectedSub,
        HARDWARE_COMMAND_KEYS.automaticStop,
        '{}',
      );
      if (!response.delivered || !response.acknowledged) {
        setCommandError(response.message ?? 'Stop could not be delivered.');
        return;
      }
      if (!response.success) {
        if (await finalizeStaleRehydratedSession(response.message)) {
          return;
        }
        setCommandError(response.message ?? 'Nothing to stop.');
        return;
      }
      const parsed = parseAutomaticResultJson(response.resultJson);
      if (parsed) {
        setRunningLocal(false);
        await endAutomaticSession('stopped manually', parsed);
        return;
      }
      if (!wasRunning) {
        return;
      }
      setCooperativeStopInProgress(true);
      try {
        await waitForAutomaticHubFinalize(
          isAutomaticSessionPendingFinalize,
          async () => {
            setRunningLocal(false);
            await endAutomaticSession('stopped manually');
          },
          MOTOR_STOP_GRACE_MS,
        );
      } finally {
        setCooperativeStopInProgress(false);
      }
    } catch (error) {
      setCommandError(formatCommandError(error));
    }
  }

  async function handleAbort() {
    setCommandError('');
    const wasRunning = automaticSessionActive || state.running;
    try {
      const response = await sendHardwareCommandRaw(selectedSub, 'abort', '{}');
      if (!response.delivered || !response.acknowledged) {
        setCommandError(response.message ?? 'Abort could not be delivered.');
        return;
      }
      if (!response.success) {
        if (await finalizeStaleRehydratedSession(response.message)) {
          return;
        }
        setCommandError(response.message ?? 'Nothing to abort.');
        return;
      }
      if (!wasRunning) {
        return;
      }
      await waitForAutomaticHubFinalize(
        isAutomaticSessionPendingFinalize,
        async () => {
          setRunningLocal(false);
          await endAutomaticSession('aborted');
        },
      );
    } catch (error) {
      setCommandError(formatCommandError(error));
    }
  }

  const endSessionMode = state.endSessionMode === 'strokes' ? 'noAutoEnd' : state.endSessionMode;

  return (
    <Panel title="Motor automatic (periodic)">
      <p className="mb-3 text-sm text-slate-400">
        H-bridge profile: duty segments with min/max timing. End session: minutes or no auto end only.
      </p>
      {sessionAccessoryError ? (
        <p className="mb-2 text-sm text-red-400" role="alert">{sessionAccessoryError}</p>
      ) : null}
      {commandError ? <p className="mb-2 text-sm text-red-400">{commandError}</p> : null}
      {cooperativeStopInProgress ? (
        <p className="mb-2 text-sm text-amber-300">Stopping after current motor segment…</p>
      ) : null}

      <MinMaxRow
        label="Duty %"
        min={state.minimumDutyPercent}
        max={state.maximumDutyPercent}
        minLimit={0}
        maxLimit={100}
        disabled={configLocked}
        onMinChange={(value) => update('minimumDutyPercent', value)}
        onMaxChange={(value) => update('maximumDutyPercent', value)}
      />

      <MinMaxRow
        label="Segment (sec)"
        min={state.segmentMinSeconds}
        max={state.segmentMaxSeconds}
        minLimit={1}
        maxLimit={3600}
        minValueMin={1}
        maxValueMin={1}
        disabled={configLocked}
        onMinChange={(value) => update('segmentMinSeconds', value)}
        onMaxChange={(value) => update('segmentMaxSeconds', value)}
      />

      <NumberField
        label="Duty ramp (ms)"
        value={state.rampMs}
        min={0}
        max={30_000}
        disabled={configLocked}
        onChange={(event) => update('rampMs', Number(event.target.value))}
      />

      <NumberField
        label="Delay before start (sec)"
        value={state.delayBeforeStartSeconds}
        min={0}
        max={3600}
        disabled={sessionRunning}
        onChange={(event) => update('delayBeforeStartSeconds', Number(event.target.value))}
      />

      <SelectField
        label="End session"
        value={endSessionMode}
        disabled={configLocked}
        options={END_SESSION_OPTIONS}
        onChange={(event) => update('endSessionMode', event.target.value as EndSessionMode)}
      />

      {endSessionMode === 'minutes' ? (
        <NumberField
          label="End after (minutes)"
          value={state.endSessionValue}
          min={1}
          max={1440}
          disabled={configLocked}
          onChange={(event) => update('endSessionValue', Number(event.target.value))}
        />
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        <CommandButton
          commandKey={HARDWARE_COMMAND_KEYS.automaticStart}
          size="lg"
          fullWidth
          disabled={!hardwareReady || sessionRunning || stopPending}
          title={hardwareDisabledReason}
          onCommand={handleStart}
        >
          Start
        </CommandButton>
        <CommandButton
          commandKey={HARDWARE_COMMAND_KEYS.automaticStop}
          size="lg"
          fullWidth
          variant="secondary"
          disabled={
            !hardwareReady ||
            !sessionRunning ||
            startPending ||
            abortPending ||
            cooperativeStopInProgress
          }
          title={hardwareDisabledReason}
          onCommand={handleStop}
        >
          Stop
        </CommandButton>
        {sessionRunning ? (
          <CommandButton
            commandKey={HARDWARE_COMMAND_KEYS.manualAbort}
            size="lg"
            fullWidth
            variant="secondary"
            disabled={!hardwareReady || startPending || abortPending}
            title={hardwareDisabledReason}
            onCommand={handleAbort}
          >
            Abort
          </CommandButton>
        ) : null}
      </div>
    </Panel>
  );
}
