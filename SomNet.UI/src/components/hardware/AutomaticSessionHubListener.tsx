import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import {
  AUTOMATIC_SESSION_COMPLETE_CORRELATION_ID,
  type HardwareCommandAck,
} from '@/types/hardwareHub';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import type { SubTargetName } from '@/config/sessionUsers';
import { subTargetsMatch } from '@/utils/readyBannerStorage';
import {
  createOperatorHardwareHub,
  startOperatorHardwareHub,
  stopOperatorHardwareHub,
} from '@/services/hardwareHub';
import type { DeviceButtonEvent } from '@/types/deviceButtonEvent';
import {
  isAutomaticStopResultJson,
  parseAutomaticResultJson,
} from '@/utils/automaticResultJson';
import { applyAutomaticDeviceComplete } from '@/utils/automaticSessionFinalize';
import { readDeviceAutomaticRunningLocal } from '@/utils/deviceAutomaticRunningLocal';
import { automaticRunningKindForActuator } from '@/utils/tabSync';

function shouldHandleAutomaticSessionComplete(ack: HardwareCommandAck): boolean {
  if (ack.correlationId !== AUTOMATIC_SESSION_COMPLETE_CORRELATION_ID) {
    return false;
  }

  return isAutomaticStopResultJson(parseAutomaticResultJson(ack.resultJson));
}

/**
 * Listens for device-initiated automatic session completion (end-rule, abort, manual stop)
 * via SignalR CommandAcknowledged (P9-D4 / P10-D3).
 */
function handleDeviceButtonEvent(
  event: DeviceButtonEvent,
  notifySiteUserReady: (subTarget: string, requestStartFeed: boolean, deviceId?: string) => void,
  markDevicePresentAck: (subTarget: SubTargetName, deviceId: string) => void,
  alignSelectedSub: (subTarget: SubTargetName) => void,
  selectDeviceId: (deviceId: string) => void,
  selectedSub: string,
) {
  if (event.clickType === 'double') {
    if (!subTargetsMatch(event.subTarget, selectedSub)) {
      alignSelectedSub(event.subTarget);
    }
    selectDeviceId(event.deviceId);
    notifySiteUserReady(event.subTarget, true, event.deviceId);
    markDevicePresentAck(event.subTarget, event.deviceId);
    return;
  }

  if (event.clickType === 'single' && import.meta.env.DEV) {
    console.info('[SomNet] Device button single click', event);
  }
}

export function AutomaticSessionHubListener() {
  const { isAuthenticated } = useAuth();
  const { settings, setDeviceAutomaticRunning } = useOptions();
  const { endAutomaticSessionForDevice, isAutomaticSessionActiveForDevice } = useLiveSession();
  const { notifySiteUserReady, markDevicePresentAck } = useSiteUserReady();
  const { selectedSub, applySubFromSync } = useSubTarget();
  const { setSelectedDeviceId, registrations } = useSubDevice();
  const settingsRef = useRef(settings);
  const registrationsRef = useRef(registrations);
  const endAutomaticSessionForDeviceRef = useRef(endAutomaticSessionForDevice);
  const isAutomaticSessionActiveForDeviceRef = useRef(isAutomaticSessionActiveForDevice);
  const setDeviceAutomaticRunningRef = useRef(setDeviceAutomaticRunning);
  const notifySiteUserReadyRef = useRef(notifySiteUserReady);
  const markDevicePresentAckRef = useRef(markDevicePresentAck);
  const setSelectedDeviceIdRef = useRef(setSelectedDeviceId);
  const applySubFromSyncRef = useRef(applySubFromSync);
  const selectedSubRef = useRef(selectedSub);

  settingsRef.current = settings;
  registrationsRef.current = registrations;
  endAutomaticSessionForDeviceRef.current = endAutomaticSessionForDevice;
  isAutomaticSessionActiveForDeviceRef.current = isAutomaticSessionActiveForDevice;
  setDeviceAutomaticRunningRef.current = setDeviceAutomaticRunning;
  notifySiteUserReadyRef.current = notifySiteUserReady;
  markDevicePresentAckRef.current = markDevicePresentAck;
  setSelectedDeviceIdRef.current = setSelectedDeviceId;
  applySubFromSyncRef.current = applySubFromSync;
  selectedSubRef.current = selectedSub;

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const connection = createOperatorHardwareHub({
      onAck: (ack) => {
        if (!shouldHandleAutomaticSessionComplete(ack)) {
          return;
        }

        const deviceId = ack.deviceId?.trim();
        if (!deviceId) {
          if (import.meta.env.DEV) {
            console.warn(
              '[SomNet] Ignoring automatic-session-complete without deviceId (multi-device requires API-forwarded deviceId)',
            );
          }
          return;
        }

        const registration = registrationsRef.current.find((row) => row.deviceId === deviceId);
        if (!registration) {
          return;
        }

        const subTarget = registration.subTarget as SubTargetName;
        const kind = automaticRunningKindForActuator(registration.actuatorKind);
        const deviceSessionRunning = readDeviceAutomaticRunningLocal(subTarget, deviceId, kind);
        const automatic = settingsRef.current.automatic;

        const parsed = parseAutomaticResultJson(ack.resultJson);
        if (!parsed) {
          return;
        }

        const sessionActive = isAutomaticSessionActiveForDeviceRef.current(subTarget, deviceId);
        void applyAutomaticDeviceComplete(
          automatic,
          parsed,
          () => setDeviceAutomaticRunningRef.current(deviceId, kind, false),
          (reason, deviceResult) =>
            endAutomaticSessionForDeviceRef.current(
              subTarget,
              deviceId,
              reason,
              deviceResult,
            ),
          sessionActive,
          deviceSessionRunning,
        );
      },
      onButtonEvent: (event) => {
        handleDeviceButtonEvent(
          event,
          notifySiteUserReadyRef.current,
          markDevicePresentAckRef.current,
          applySubFromSyncRef.current,
          setSelectedDeviceIdRef.current,
          selectedSubRef.current,
        );
      },
    });

    let cancelled = false;

    void startOperatorHardwareHub(connection).catch(() => {
      if (!cancelled && import.meta.env.DEV) {
        console.warn('[SomNet] Hardware hub listener failed to connect');
      }
    });

    return () => {
      cancelled = true;
      void stopOperatorHardwareHub(connection);
    };
  }, [isAuthenticated]);

  return null;
}
