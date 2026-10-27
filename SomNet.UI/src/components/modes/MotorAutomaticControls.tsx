import { useEffect, useMemo, useRef, useState } from 'react';
import { BURST_STYLE_OPTIONS, type EndSessionMode } from '@/types/modes';
import {
  MOTOR_AUTOMATIC_RUN_MODE_OPTIONS,
  type MotorAutomaticRunMode,
} from '@/types/motorAutomaticModes';
import type { MotorAutomaticControlState } from '@/types/motorModes';
import { useOptions } from '@/context/OptionsProvider';
import { useControlPanelSettings } from '@/hooks/useControlPanelSettings';
import { useOperationSession } from '@/hooks/useOperationSession';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useOperationDeviceId } from '@/context/DeviceOperationScope';
import { useDeviceSceneSessionActive } from '@/hooks/useDeviceSceneSessionActive';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import { Panel } from '@/components/ui/Panel';
import { CommandButton } from '@/components/ui/CommandButton';
import { ClampedNumberField } from '@/components/ui/ClampedNumberField';
import { NumberField, MinMaxRow } from '@/components/ui/NumberField';
import { MotorSpeedSlider } from '@/components/modes/MotorSpeedSlider';
import { Checkbox } from '@/components/ui/Checkbox';
import { RadioGroup, SelectField } from '@/components/ui/RadioGroup';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import { sendHardwareCommand as sendHardwareCommandRaw } from '@/api/devices';
import { buildMotorAutomaticStartPayload } from '@/utils/motorAutomaticStartPayload';
import { parseAutomaticResultJson } from '@/utils/automaticResultJson';
import { waitForAutomaticHubFinalize } from '@/utils/automaticSessionFinalize';
import { isDeviceAutomaticIdleMessage } from '@/utils/automaticSessionReconcile';
import { writeAutomaticDeviceRunningHint } from '@/utils/automaticDeviceRunningHint';
import { ApiError } from '@/api/client';
import { HardwareCommandError, sendHardwareCommand } from '@/services/hardwareCommand';
import { isHardwareCommandReady } from '@/utils/commandReadiness';
import { computeStrokeMs } from '@/utils/stroke';
import { MIN_STROKE_GAP_SECONDS } from '@/utils/automaticFieldRules';
import {
  getMotorAutomaticFieldRules,
} from '@/utils/motorAutomaticFieldRules';
import {
  getBurstFieldRules,
  MAX_BURST_DELAY_SEC,
  MAX_BURST_STROKES,
  MIN_BURST_DELAY_SEC,
  MIN_BURST_STROKE_POWER,
} from '@/utils/burstFieldRules';
import { applyMotorAutomaticModeChange } from '@/utils/motorAutomaticFieldRules';
import { getMotorAutomaticModeInfo } from '@/utils/motorAutomaticModeInfo';

const MOTOR_STOP_GRACE_MS = 60_000;
const DUTY_MIN = 0;
const DUTY_MAX = 100;

const END_SESSION_OPTIONS: { value: EndSessionMode; label: string }[] = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'strokes', label: 'Strokes' },
  { value: 'noAutoEnd', label: 'No AutoEnd' },
];

function clampDuty(value: number): number {
  return Math.max(DUTY_MIN, Math.min(DUTY_MAX, Math.trunc(value)));
}

export function MotorAutomaticControls() {
  const { options } = useOptions();
  const {
    settings,
    settingsLoaded,
    isLoading,
    updateMotorAutomatic,
    setMotorAutomaticRunningLocal,
  } = useControlPanelSettings();
  const state = settings.motorAutomatic;
  const { selectedSub } = useSubTarget();
  const commandDeviceId = useOperationDeviceId();
  const sceneSessionActive = useDeviceSceneSessionActive(commandDeviceId);
  const { expandOnAction } = useVideoDisplay();
  const {
    endAutomaticSession,
    activeSession,
    markAutomaticDeviceStarted,
    syncActiveSessionMode,
  } = useOperationSession();
  const { isCommandPending } = useHardwareCommand();
  const { getDeviceStatus } = useSystemStatus();
  const systemStatus = getDeviceStatus(commandDeviceId);
  const [commandError, setCommandError] = useState('');
  const [cooperativeStopInProgress, setCooperativeStopInProgress] = useState(false);
  const runningRef = useRef(state.running);
  const activeSessionRef = useRef(activeSession);
  runningRef.current = state.running;
  activeSessionRef.current = activeSession;

  const fieldRules = useMemo(
    () => getMotorAutomaticFieldRules(state.automaticMode),
    [state.automaticMode],
  );

  const burstFieldRules = useMemo(
    () => getBurstFieldRules(state.burstStyle),
    [state.burstStyle],
  );

  const modeInfo = useMemo(
    () => getMotorAutomaticModeInfo(state.automaticMode),
    [state.automaticMode],
  );

  const automaticSessionActive = activeSession?.mode === 'automatic';
  const sessionRunning = settingsLoaded && state.running;
  const allowLiveOverrides = options.allowAutomaticModeOverrides;
  const liveOverridesActive = sessionRunning && allowLiveOverrides;
  const configLocked = sessionRunning && !allowLiveOverrides;
  const lastPushedUpdateRef = useRef<string | null>(null);
  const updateDebounceRef = useRef<number | null>(null);
  const burstSettingsDisabled = configLocked || !state.burstsOn;
  const delayStartLocked = sessionRunning;
  const hardwareReady = isHardwareCommandReady(systemStatus) && sceneSessionActive;
  const startPending = isCommandPending(HARDWARE_COMMAND_KEYS.automaticStart, commandDeviceId);
  const stopPending = isCommandPending(HARDWARE_COMMAND_KEYS.automaticStop, commandDeviceId);
  const abortPending = isCommandPending(HARDWARE_COMMAND_KEYS.manualAbort, commandDeviceId);
  const showAbortControl =
    sessionRunning || automaticSessionActive || startPending || cooperativeStopInProgress;
  const hardwareDisabledReason = !sceneSessionActive
    ? 'Turn Scene session on before Start (history / video).'
    : hardwareReady
      ? undefined
      : systemStatus.detail || systemStatus.summary;

  const minimumDutyPercent = useMemo(
    () =>
      computeStrokeMs(
        state.minimumSpeedPercent,
        state.minimumDutyPercent,
        state.maximumDutyPercent,
      ),
    [state.minimumSpeedPercent, state.minimumDutyPercent, state.maximumDutyPercent],
  );

  const maximumDutyPercent = useMemo(
    () =>
      computeStrokeMs(
        state.maximumSpeedPercent,
        state.minimumDutyPercent,
        state.maximumDutyPercent,
      ),
    [state.maximumSpeedPercent, state.minimumDutyPercent, state.maximumDutyPercent],
  );

  const endSessionValueDisabled = state.endSessionMode === 'noAutoEnd';

  const endSessionOptions = useMemo(
    () =>
      END_SESSION_OPTIONS.map((option) => ({
        ...option,
        disabled:
          option.value === 'strokes'
            ? true
            : option.value === 'noAutoEnd'
              ? fieldRules.disableNoAutoEnd
              : false,
      })),
    [fieldRules.disableNoAutoEnd],
  );

  useEffect(() => {
    if (!automaticSessionActive && !state.running) {
      setCooperativeStopInProgress(false);
    }
  }, [automaticSessionActive, state.running]);

  useEffect(() => {
    setCommandError('');
  }, [selectedSub]);

  useEffect(() => {
    if (systemStatus.isReady) {
      setCommandError('');
    }
  }, [systemStatus.isReady]);

  useEffect(() => {
    if (!liveOverridesActive) {
      lastPushedUpdateRef.current = null;
    }
  }, [liveOverridesActive]);

  useEffect(() => {
    if (isLoading || !settingsLoaded || startPending) {
      return;
    }

    if (!state.running) {
      return;
    }

    if (automaticSessionActive) {
      return;
    }

    if (sceneSessionActive && activeSession?.deviceId === commandDeviceId) {
      return;
    }

    setRunningLocal(false);
  }, [
    activeSession?.deviceId,
    automaticSessionActive,
    commandDeviceId,
    isLoading,
    sceneSessionActive,
    settingsLoaded,
    startPending,
    state.running,
  ]);

  useEffect(() => {
    if (isLoading || !settingsLoaded || !liveOverridesActive) {
      return;
    }

    const payload = buildMotorAutomaticStartPayload(state);
    if (lastPushedUpdateRef.current === null) {
      lastPushedUpdateRef.current = payload;
      return;
    }

    if (payload === lastPushedUpdateRef.current) {
      return;
    }

    if (updateDebounceRef.current !== null) {
      window.clearTimeout(updateDebounceRef.current);
    }

    updateDebounceRef.current = window.setTimeout(() => {
      updateDebounceRef.current = null;
      void (async () => {
        try {
          await sendHardwareCommand(
            selectedSub,
            commandDeviceId,
            HARDWARE_COMMAND_KEYS.automaticUpdate,
            payload,
          );
          lastPushedUpdateRef.current = payload;
          setCommandError('');
        } catch (error) {
          setCommandError(formatCommandError(error));
        }
      })();
    }, 400);

    return () => {
      if (updateDebounceRef.current !== null) {
        window.clearTimeout(updateDebounceRef.current);
      }
    };
  }, [commandDeviceId, isLoading, settingsLoaded, liveOverridesActive, selectedSub, state]);

  function setRunningLocal(running: boolean) {
    setMotorAutomaticRunningLocal(running);
  }

  function update<K extends keyof MotorAutomaticControlState>(
    key: K,
    value: MotorAutomaticControlState[K],
  ) {
    if (configLocked) {
      return;
    }

    if (key === 'minimumDutyPercent' || key === 'maximumDutyPercent') {
      return;
    }

    if (key === 'running') {
      setRunningLocal(value as boolean);
      return;
    }

    if (key !== 'burstsOn' && !state.burstsOn && String(key).startsWith('burst')) {
      return;
    }

    updateMotorAutomatic({ ...state, [key]: value });
  }

  function handleAutomaticModeChange(nextMode: MotorAutomaticRunMode) {
    updateMotorAutomatic(applyMotorAutomaticModeChange(state, nextMode));
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
    expandOnAction(commandDeviceId);
    const payloadJson = buildMotorAutomaticStartPayload(state);
    try {
      await sendHardwareCommand(
        selectedSub,
        commandDeviceId,
        HARDWARE_COMMAND_KEYS.automaticStart,
        payloadJson,
      );
      if (activeSessionRef.current?.mode !== 'automatic') {
        await syncActiveSessionMode('automatic');
      }
      markAutomaticDeviceStarted();
      const sessionId = activeSessionRef.current?.id;
      if (sessionId) {
        writeAutomaticDeviceRunningHint({
          sessionId,
          subTarget: selectedSub,
          deviceId: commandDeviceId,
        });
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
        commandDeviceId,
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
      const response = await sendHardwareCommandRaw(selectedSub, commandDeviceId, 'abort', '{}');
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

  if (isLoading || !settingsLoaded) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Loading saved automatic settings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessionRunning ? (
        <p className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
          {allowLiveOverrides ? (
            <>
              Session running — changes apply after the current segment. Delay-before-start stays
              locked.
            </>
          ) : (
            <>
              Session running — settings are locked. Enable live overrides in Options → General to
              adjust mid-session.
            </>
          )}
          {cooperativeStopInProgress ? (
            <> Stop requested — finishing current segment or burst. Abort cuts off immediately.</>
          ) : state.burstsOn ? (
            <> Stop finishes the current burst; Abort cuts off immediately.</>
          ) : null}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Speed Settings" className="min-w-0 overflow-hidden">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-8">
            <ClampedNumberField
              label="Minimum Duty (%)"
              inline
              value={state.minimumDutyPercent}
              min={DUTY_MIN}
              max={DUTY_MAX}
              disabled={configLocked}
              onCommit={(nextMin) => {
                const minimumDutyPercent = clampDuty(nextMin);
                updateMotorAutomatic({
                  ...state,
                  minimumDutyPercent,
                  maximumDutyPercent: Math.max(minimumDutyPercent, state.maximumDutyPercent),
                });
              }}
            />
            <ClampedNumberField
              label="Maximum Duty (%)"
              inline
              value={state.maximumDutyPercent}
              min={state.minimumDutyPercent}
              max={DUTY_MAX}
              disabled={configLocked}
              onCommit={(nextMax) => {
                const maximumDutyPercent = clampDuty(nextMax);
                updateMotorAutomatic({
                  ...state,
                  maximumDutyPercent,
                  minimumDutyPercent: Math.min(maximumDutyPercent, state.minimumDutyPercent),
                });
              }}
            />
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-2">
            <div className="space-y-1">
              <MotorSpeedSlider
                label="Minimum Speed"
                percent={state.minimumSpeedPercent}
                minimumDuty={state.minimumDutyPercent}
                maximumDuty={state.maximumDutyPercent}
                dutyPercent={minimumDutyPercent}
                disabled={configLocked || fieldRules.disableMinimumSpeed}
                title={
                  fieldRules.disableMinimumSpeed
                    ? 'Not used in this automatic mode — device uses maximum speed'
                    : undefined
                }
                onChange={(event) => update('minimumSpeedPercent', Number(event.target.value))}
              />
              {fieldRules.disableMinimumSpeed ? (
                <p className="text-center text-xs text-slate-500 sm:text-left">
                  Not used — device uses maximum speed.
                </p>
              ) : null}
            </div>
            <MotorSpeedSlider
              label="Maximum Speed"
              percent={state.maximumSpeedPercent}
              minimumDuty={state.minimumDutyPercent}
              maximumDuty={state.maximumDutyPercent}
              dutyPercent={maximumDutyPercent}
              disabled={configLocked}
              onChange={(event) => update('maximumSpeedPercent', Number(event.target.value))}
            />
          </div>
        </Panel>

        <Panel title="Timing Settings">
          <div className="space-y-5">
            <div>
              <p className="mb-3 text-sm font-medium text-slate-300">Time Between Graph Points</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <NumberField
                    label="Minimum (sec)"
                    alignLabelHeight
                    value={state.segmentMinSeconds}
                    min={MIN_STROKE_GAP_SECONDS}
                    disabled={configLocked || fieldRules.disableSegmentMinSeconds}
                    title={
                      fieldRules.disableSegmentMinSeconds
                        ? 'Not used in this automatic mode'
                        : undefined
                    }
                    onChange={(event) => {
                      const parsed = Math.trunc(Number(event.target.value));
                      if (Number.isFinite(parsed)) {
                        update('segmentMinSeconds', parsed);
                      }
                    }}
                  />
                  {fieldRules.disableSegmentMinSeconds ? (
                    <p className="text-xs text-slate-500">Not used in this mode.</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <NumberField
                    label="Maximum (sec)"
                    alignLabelHeight
                    value={state.segmentMaxSeconds}
                    min={MIN_STROKE_GAP_SECONDS}
                    disabled={configLocked || fieldRules.disableSegmentMaxSeconds}
                    title={
                      fieldRules.disableSegmentMaxSeconds
                        ? 'Not used in this automatic mode — continuous set speed'
                        : undefined
                    }
                    onChange={(event) => {
                      const parsed = Math.trunc(Number(event.target.value));
                      if (Number.isFinite(parsed)) {
                        update('segmentMaxSeconds', parsed);
                      }
                    }}
                  />
                  {fieldRules.disableSegmentMaxSeconds ? (
                    <p className="text-xs text-slate-500">Not used — continuous set speed.</p>
                  ) : null}
                </div>
                <NumberField
                  label="Delay Before Start (sec)"
                  alignLabelHeight
                  value={state.delayBeforeStartSeconds}
                  min={0}
                  disabled={delayStartLocked}
                  onChange={(event) => {
                    const parsed = Math.trunc(Number(event.target.value));
                    if (Number.isFinite(parsed)) {
                      update('delayBeforeStartSeconds', parsed);
                    }
                  }}
                />
              </div>
              <div className="mt-3 max-w-xs">
                <ClampedNumberField
                  label="Stop ramp (ms)"
                  value={state.rampMs}
                  min={0}
                  max={30_000}
                  disabled={configLocked}
                  title="Ramp down to zero on Stop or end session. Speed changes between graph points use the segment interval."
                  onCommit={(value) => update('rampMs', value)}
                />
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-slate-300">End Session After</p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <NumberField
                  value={state.endSessionValue}
                  min={0}
                  disabled={configLocked || endSessionValueDisabled}
                  className="w-20 text-center"
                  onChange={(event) => {
                    const parsed = Math.trunc(Number(event.target.value));
                    if (Number.isFinite(parsed)) {
                      update('endSessionValue', parsed);
                    }
                  }}
                />
                <RadioGroup
                  name="motorEndSessionMode"
                  value={state.endSessionMode}
                  disabled={configLocked}
                  options={endSessionOptions}
                  onChange={(value) => update('endSessionMode', value as EndSessionMode)}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Strokes is disabled until rotation feedback hardware is available on the motor.
              </p>
              {modeInfo.endSessionNote ? (
                <p className="mt-2 text-xs text-slate-500">{modeInfo.endSessionNote}</p>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel title="Burst Settings">
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-slate-500">
              When Bursts On is checked, scheduled burst clusters run on top of the selected
              automatic program. Burst speed percent is relative to Speed Settings min/max duty.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Checkbox
                label="Bursts On"
                checked={state.burstsOn}
                disabled={configLocked}
                onChange={(event) => update('burstsOn', event.target.checked)}
              />
              <NumberField
                label="Percent (0 to 100)"
                inline
                value={state.burstPercent}
                min={0}
                max={100}
                disabled={burstSettingsDisabled}
                onChange={(event) => {
                  const parsed = Math.trunc(Number(event.target.value));
                  if (Number.isFinite(parsed)) {
                    update('burstPercent', parsed);
                  }
                }}
              />
            </div>

            <SelectField
              label="Burst Style"
              value={state.burstStyle}
              disabled={burstSettingsDisabled}
              options={BURST_STYLE_OPTIONS}
              onChange={(event) =>
                update('burstStyle', event.target.value as MotorAutomaticControlState['burstStyle'])
              }
            />

            <MinMaxRow
              label="Burst Speed in Percent (0 to 100)"
              min={state.burstStrokePowerMin}
              max={state.burstStrokePowerMax}
              minLimit={0}
              minValueMin={MIN_BURST_STROKE_POWER}
              maxLimit={100}
              disabled={burstSettingsDisabled}
              minDisabled={burstFieldRules.disableBurstStrokePowerMin}
              hint={
                burstFieldRules.disableBurstStrokePowerMin
                  ? 'Min not used — device uses maximum speed.'
                  : undefined
              }
              onMinChange={(value) => update('burstStrokePowerMin', value)}
              onMaxChange={(value) => update('burstStrokePowerMax', value)}
            />

            <MinMaxRow
              label="Delay Between Burst Segments in Seconds"
              min={state.burstDelayMin}
              max={state.burstDelayMax}
              minLimit={0}
              minValueMin={MIN_BURST_DELAY_SEC}
              maxLimit={MAX_BURST_DELAY_SEC}
              disabled={burstSettingsDisabled}
              minDisabled={burstFieldRules.disableBurstDelayMin}
              hint={
                burstFieldRules.disableBurstDelayMin
                  ? 'Min not used — device uses maximum delay.'
                  : undefined
              }
              onMinChange={(value) => update('burstDelayMin', value)}
              onMaxChange={(value) => update('burstDelayMax', value)}
            />

            <MinMaxRow
              label="Number of Segments in Each Burst"
              min={state.burstStrokesMin}
              max={state.burstStrokesMax}
              minLimit={1}
              maxLimit={MAX_BURST_STROKES}
              disabled={burstSettingsDisabled}
              onMinChange={(value) => update('burstStrokesMin', value)}
              onMaxChange={(value) => update('burstStrokesMax', value)}
            />
          </div>
        </Panel>

        <Panel title="Controls">
          <div className="flex h-full flex-col justify-center gap-3">
            {!hardwareReady && !commandError && !startPending && !stopPending && !abortPending ? (
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
              options={MOTOR_AUTOMATIC_RUN_MODE_OPTIONS}
              onChange={(event) =>
                handleAutomaticModeChange(event.target.value as MotorAutomaticRunMode)
              }
            />
            <p className="text-xs leading-relaxed text-slate-500">{modeInfo.summary}</p>
            <CommandButton
              commandKey={HARDWARE_COMMAND_KEYS.automaticStart}
              size="lg"
              fullWidth
              className="py-4 text-base"
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
              className="py-4 text-base"
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
            {showAbortControl ? (
              <CommandButton
                commandKey={HARDWARE_COMMAND_KEYS.manualAbort}
                size="lg"
                fullWidth
                variant="secondary"
                className="py-4 text-base"
                disabled={!hardwareReady || startPending || abortPending}
                title={hardwareDisabledReason}
                onCommand={handleAbort}
              >
                Abort
              </CommandButton>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
