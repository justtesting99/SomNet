import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchPairingSettings, savePairingSettings } from '@/api/settings';
import { useAuth } from '@/context/AuthProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import type { AutomaticControlState, ManualControlState } from '@/types/modes';
import { DEFAULT_PAIRING_SETTINGS, type PairingSettings } from '@/types/pairingSettings';
import { normalizeAutomaticControlState } from '@/utils/automaticFieldRules';
import { normalizeMotorAutomaticControlState } from '@/utils/motorAutomaticFieldRules';
import { normalizeMotorManualControlState } from '@/utils/motorManualFieldRules';
import type { MotorAutomaticControlState, MotorManualControlState } from '@/types/motorModes';
import { normalizeStrokeMsPair } from '@/utils/strokeMsLimits';
import {
  readDeviceAutomaticRunningLocal,
  writeDeviceAutomaticRunningLocal,
} from '@/utils/deviceAutomaticRunningLocal';
import { cacheDeviceSettings } from '@/utils/deviceSettingsCache';
import { automaticRunningKindForActuator } from '@/utils/tabSync';
import type { ActuatorKind } from '@/types/device';

interface DevicePairingSettingsSlice {
  settings: PairingSettings;
  isLoading: boolean;
  settingsLoaded: boolean;
  updateManual: (manual: ManualControlState) => void;
  updateAutomatic: (automatic: AutomaticControlState) => void;
  updateMotorAutomatic: (motorAutomatic: MotorAutomaticControlState) => void;
  updateMotorManual: (motorManual: MotorManualControlState) => void;
  setAutomaticRunningLocal: (running: boolean) => void;
  setMotorAutomaticRunningLocal: (running: boolean) => void;
}

interface DevicePairingSettingsContextValue {
  rows: Record<string, DeviceRow>;
  getSlice: (deviceId: string, actuatorKind: ActuatorKind) => DevicePairingSettingsSlice;
}

const DevicePairingSettingsContext = createContext<DevicePairingSettingsContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 400;

type DeviceRow = {
  settings: PairingSettings;
  loaded: boolean;
  loading: boolean;
  userEdited: boolean;
  generation: number;
};

export function DevicePairingSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const { registrations } = useSubDevice();
  const { strokeLimits, setDeviceAutomaticRunning } = useOptions();
  const domTarget = user?.displayName ?? user?.username ?? '';
  const [rows, setRows] = useState<Record<string, DeviceRow>>({});
  const rowsRef = useRef(rows);
  const saveTimersRef = useRef<Record<string, number>>({});
  rowsRef.current = rows;

  const persistSettings = useCallback(
    async (deviceId: string, nextSettings: PairingSettings, generation: number) => {
      if (!domTarget) {
        return nextSettings;
      }

      const saved = await savePairingSettings(selectedSub, deviceId, nextSettings);
      const current = rowsRef.current[deviceId];
      if (!current || current.generation !== generation) {
        return saved;
      }

      return saved;
    },
    [domTarget, selectedSub],
  );

  const queuePersist = useCallback(
    (deviceId: string, nextSettings: PairingSettings, generation: number) => {
      const existingTimer = saveTimersRef.current[deviceId];
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }

      saveTimersRef.current[deviceId] = window.setTimeout(() => {
        delete saveTimersRef.current[deviceId];
        void persistSettings(deviceId, nextSettings, generation).then((saved) => {
          setRows((prev) => {
            const row = prev[deviceId];
            if (!row || row.generation !== generation) {
              return prev;
            }

            return { ...prev, [deviceId]: { ...row, settings: saved } };
          });
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [persistSettings],
  );

  useEffect(() => {
    if (!domTarget || registrations.length === 0) {
      setRows({});
      return;
    }

    let cancelled = false;
    const deviceIds = registrations.map((row) => row.deviceId);

    setRows((prev) => {
      const next: Record<string, DeviceRow> = {};
      for (const registration of registrations) {
        const existing = prev[registration.deviceId];
        next[registration.deviceId] =
          existing ??
          ({
            settings: DEFAULT_PAIRING_SETTINGS,
            loaded: false,
            loading: true,
            userEdited: false,
            generation: 0,
          } satisfies DeviceRow);
      }

      return next;
    });

    void Promise.all(
      registrations.map(async (registration) => {
        const kind = automaticRunningKindForActuator(registration.actuatorKind);
        const restoredRunning = readDeviceAutomaticRunningLocal(
          selectedSub,
          registration.deviceId,
          kind,
        );

        const loadedSettings = await fetchPairingSettings(selectedSub, registration.deviceId);
        if (cancelled) {
          return;
        }

        const automaticStroke = normalizeStrokeMsPair(
          loadedSettings.automatic.minimumStrokeMs,
          loadedSettings.automatic.maximumStrokeMs,
          strokeLimits,
        );
        const manualStroke = normalizeStrokeMsPair(
          loadedSettings.manual.minimumStrokeMs,
          loadedSettings.manual.maximumStrokeMs,
          strokeLimits,
        );

        const mergedSettings = {
              ...loadedSettings,
              manual: { ...loadedSettings.manual, ...manualStroke },
              automatic: normalizeAutomaticControlState({
                ...loadedSettings.automatic,
                ...automaticStroke,
                running: kind === 'relay' ? restoredRunning : false,
              }),
              motorAutomatic: normalizeMotorAutomaticControlState({
                ...loadedSettings.motorAutomatic,
                running: kind === 'motor' ? restoredRunning : false,
              }),
              motorManual: normalizeMotorManualControlState(
                loadedSettings.motorManual ?? DEFAULT_PAIRING_SETTINGS.motorManual,
              ),
            };
        cacheDeviceSettings(selectedSub, registration.deviceId, mergedSettings);
        setRows((prev) => ({
          ...prev,
          [registration.deviceId]: {
            settings: mergedSettings,
            loaded: true,
            loading: false,
            userEdited: false,
            generation: (prev[registration.deviceId]?.generation ?? 0) + 1,
          },
        }));
      }),
    ).catch(() => {
      if (!cancelled) {
        setRows((prev) => {
          const next = { ...prev };
          for (const deviceId of deviceIds) {
            if (next[deviceId]) {
              next[deviceId] = { ...next[deviceId], loading: false, loaded: false };
            }
          }
          return next;
        });
      }
    });

    return () => {
      cancelled = true;
      for (const timer of Object.values(saveTimersRef.current)) {
        window.clearTimeout(timer);
      }
      saveTimersRef.current = {};
    };
  }, [domTarget, registrations, selectedSub, strokeLimits]);

  const applyPatch = useCallback(
    (deviceId: string, patch: (settings: PairingSettings) => PairingSettings, persist = true) => {
      setRows((prev) => {
        const row = prev[deviceId];
        if (!row) {
          return prev;
        }

        const nextSettings = patch(row.settings);
        const nextRow: DeviceRow = {
          ...row,
          settings: nextSettings,
          userEdited: true,
        };

        if (persist && row.loaded) {
          queuePersist(deviceId, nextSettings, nextRow.generation);
        }

        cacheDeviceSettings(selectedSub, deviceId, nextSettings);
        return { ...prev, [deviceId]: nextRow };
      });
    },
    [queuePersist],
  );

  const getSlice = useCallback(
    (deviceId: string, actuatorKind: ActuatorKind): DevicePairingSettingsSlice => {
      const row = rows[deviceId] ?? {
        settings: DEFAULT_PAIRING_SETTINGS,
        loaded: false,
        loading: true,
        userEdited: false,
        generation: 0,
      };

      const kind = automaticRunningKindForActuator(actuatorKind);

      const setRunning = (running: boolean) => {
        writeDeviceAutomaticRunningLocal(selectedSub, deviceId, kind, running);
        setDeviceAutomaticRunning(deviceId, kind, running);
        applyPatch(
          deviceId,
          (settings) => {
            if (kind === 'motor') {
              return {
                ...settings,
                motorAutomatic: { ...settings.motorAutomatic, running },
              };
            }

            return {
              ...settings,
              automatic: { ...settings.automatic, running },
            };
          },
          false,
        );
      };

      return {
        settings: row.settings,
        isLoading: row.loading,
        settingsLoaded: row.loaded,
        updateManual: (manual) => {
          const normalizedStroke = normalizeStrokeMsPair(
            manual.minimumStrokeMs,
            manual.maximumStrokeMs,
            strokeLimits,
          );
          applyPatch(deviceId, (settings) => ({
            ...settings,
            manual: { ...manual, ...normalizedStroke },
          }));
        },
        updateAutomatic: (automatic) => {
          if (kind === 'motor') {
            return;
          }

          const normalizedStroke = normalizeStrokeMsPair(
            automatic.minimumStrokeMs,
            automatic.maximumStrokeMs,
            strokeLimits,
          );
          applyPatch(deviceId, (settings) => ({
            ...settings,
            automatic: normalizeAutomaticControlState({
              ...automatic,
              ...normalizedStroke,
            }),
          }));
        },
        updateMotorAutomatic: (motorAutomatic) => {
          if (kind === 'relay') {
            return;
          }

          applyPatch(deviceId, (settings) => ({
            ...settings,
            motorAutomatic: normalizeMotorAutomaticControlState(motorAutomatic),
          }));
        },
        updateMotorManual: (motorManual) => {
          if (kind === 'relay') {
            return;
          }

          applyPatch(deviceId, (settings) => ({
            ...settings,
            motorManual: normalizeMotorManualControlState(motorManual),
          }));
        },
        setAutomaticRunningLocal: (running) => setRunning(running),
        setMotorAutomaticRunningLocal: (running) => setRunning(running),
      };
    },
    [applyPatch, rows, selectedSub, setDeviceAutomaticRunning, strokeLimits],
  );

  const value = useMemo(() => ({ rows, getSlice }), [getSlice, rows]);

  return (
    <DevicePairingSettingsContext.Provider value={value}>
      {children}
    </DevicePairingSettingsContext.Provider>
  );
}

export function useDevicePairingSettings(
  deviceId: string,
  actuatorKind: ActuatorKind,
): DevicePairingSettingsSlice {
  const context = useContext(DevicePairingSettingsContext);
  if (!context) {
    throw new Error('useDevicePairingSettings must be used within DevicePairingSettingsProvider');
  }

  const row = context.rows[deviceId];
  void row?.generation;
  void row?.loaded;

  return context.getSlice(deviceId, actuatorKind);
}
