import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import {
  AUTOMATIC_SESSION_COMPLETE_CORRELATION_ID,
  type HardwareCommandAck,
} from '@/types/hardwareHub';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
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
  notifySiteUserReady: (subTarget: string, requestStartFeed: boolean) => void,
  markSubPresentAck: (subTarget: string) => void,
) {
  if (event.clickType === 'double') {
    notifySiteUserReady(event.subTarget, true);
    markSubPresentAck(event.subTarget);
    return;
  }

  if (event.clickType === 'single' && import.meta.env.DEV) {
    console.info('[SomNet] Device button single click', event);
  }
}

export function AutomaticSessionHubListener() {
  const { isAuthenticated } = useAuth();
  const { settings, setAutomaticRunningLocal } = useOptions();
  const { activeSession, endAutomaticSession } = useLiveSession();
  const { notifySiteUserReady, markSubPresentAck } = useSiteUserReady();
  const automaticRef = useRef(settings.automatic);
  const activeSessionRef = useRef(activeSession);
  const endAutomaticSessionRef = useRef(endAutomaticSession);
  const clearAutomaticRunningRef = useRef<() => void>(() => setAutomaticRunningLocal(false));
  const notifySiteUserReadyRef = useRef(notifySiteUserReady);
  const markSubPresentAckRef = useRef(markSubPresentAck);

  automaticRef.current = settings.automatic;
  activeSessionRef.current = activeSession;
  endAutomaticSessionRef.current = endAutomaticSession;
  clearAutomaticRunningRef.current = () => setAutomaticRunningLocal(false);
  notifySiteUserReadyRef.current = notifySiteUserReady;
  markSubPresentAckRef.current = markSubPresentAck;

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const connection = createOperatorHardwareHub({
      onAck: (ack) => {
        if (!shouldHandleAutomaticSessionComplete(ack)) {
          return;
        }

        const automatic = automaticRef.current;
        const sessionActive = activeSessionRef.current?.mode === 'automatic';
        if (!automatic.running && !sessionActive) {
          return;
        }

        const parsed = parseAutomaticResultJson(ack.resultJson);
        if (!parsed) {
          return;
        }

        void applyAutomaticDeviceComplete(
          automatic,
          parsed,
          clearAutomaticRunningRef.current,
          endAutomaticSessionRef.current,
          sessionActive,
        );
      },
      onButtonEvent: (event) => {
        handleDeviceButtonEvent(
          event,
          notifySiteUserReadyRef.current,
          markSubPresentAckRef.current,
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
