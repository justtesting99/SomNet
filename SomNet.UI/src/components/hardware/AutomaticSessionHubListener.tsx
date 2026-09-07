import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import {
  AUTOMATIC_SESSION_COMPLETE_CORRELATION_ID,
  type HardwareCommandAck,
} from '@/types/hardwareHub';
import {
  createOperatorHardwareHub,
  startOperatorHardwareHub,
  stopOperatorHardwareHub,
} from '@/services/hardwareHub';
import {
  isAutomaticStopResultJson,
  parseAutomaticResultJson,
} from '@/utils/automaticResultJson';

function shouldHandleAutomaticSessionComplete(ack: HardwareCommandAck): boolean {
  if (ack.correlationId !== AUTOMATIC_SESSION_COMPLETE_CORRELATION_ID) {
    return false;
  }

  return isAutomaticStopResultJson(parseAutomaticResultJson(ack.resultJson));
}

/**
 * Listens for device-initiated automatic session completion (end-rule / abort)
 * via SignalR CommandAcknowledged (P9-D4).
 */
export function AutomaticSessionHubListener() {
  const { isAuthenticated } = useAuth();
  const { settings, updateAutomatic } = useOptions();
  const { endAutomaticSession } = useLiveSession();
  const automaticRef = useRef(settings.automatic);
  const endAutomaticSessionRef = useRef(endAutomaticSession);
  const updateAutomaticRef = useRef(updateAutomatic);

  automaticRef.current = settings.automatic;
  endAutomaticSessionRef.current = endAutomaticSession;
  updateAutomaticRef.current = updateAutomatic;

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const connection = createOperatorHardwareHub((ack) => {
      if (!shouldHandleAutomaticSessionComplete(ack)) {
        return;
      }

      const automatic = automaticRef.current;
      if (!automatic.running) {
        return;
      }

      const parsed = parseAutomaticResultJson(ack.resultJson);
      if (!parsed) {
        return;
      }

      updateAutomaticRef.current({ ...automatic, running: false });
      void endAutomaticSessionRef.current('', parsed);
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
