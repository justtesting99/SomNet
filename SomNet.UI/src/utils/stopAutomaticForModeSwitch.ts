import { sendHardwareCommand as sendHardwareCommandRaw } from '@/api/devices';
import type { SubTargetName } from '@/config/sessionUsers';
import type { AutomaticControlState } from '@/types/modes';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import type { AutomaticResultJson } from '@/utils/automaticResultJson';
import { parseAutomaticResultJson } from '@/utils/automaticResultJson';
import {
  computeAutomaticStopGraceMs,
  waitForAutomaticHubFinalize,
} from '@/utils/automaticSessionFinalize';
import { isDeviceAutomaticIdleMessage } from '@/utils/automaticSessionReconcile';

interface StopAutomaticForModeSwitchHandlers {
  endAutomaticSession: (
    reason: string,
    deviceResult?: AutomaticResultJson | null,
  ) => Promise<void>;
  setAutomaticRunningLocal: (running: boolean) => void;
  isAutomaticSessionActive: () => boolean;
}

/** Stop device automatic session before Switch mode / sign-out (P15 follow-up). */
export async function stopAutomaticForModeSwitch(
  subTarget: SubTargetName,
  automatic: AutomaticControlState,
  handlers: StopAutomaticForModeSwitchHandlers,
): Promise<void> {
  if (!handlers.isAutomaticSessionActive() && !automatic.running) {
    return;
  }

  try {
    const response = await sendHardwareCommandRaw(
      subTarget,
      HARDWARE_COMMAND_KEYS.automaticStop,
      '{}',
    );

    handlers.setAutomaticRunningLocal(false);

    if (!response.delivered || !response.acknowledged) {
      if (handlers.isAutomaticSessionActive()) {
        await handlers.endAutomaticSession('mode-switch');
      }
      return;
    }

    if (!response.success) {
      const message = response.message ?? '';
      if (
        isDeviceAutomaticIdleMessage(message) ||
        message.toLowerCase().includes('nothing to stop')
      ) {
        if (handlers.isAutomaticSessionActive()) {
          await handlers.endAutomaticSession('mode-switch (device already idle)');
        }
        return;
      }

      if (handlers.isAutomaticSessionActive()) {
        await handlers.endAutomaticSession('mode-switch');
      }
      return;
    }

    const parsed = parseAutomaticResultJson(response.resultJson);
    if (parsed) {
      await handlers.endAutomaticSession('mode-switch', parsed);
      return;
    }

    if (!handlers.isAutomaticSessionActive() && !automatic.running) {
      return;
    }

    await waitForAutomaticHubFinalize(
      handlers.isAutomaticSessionActive,
      async () => {
        handlers.setAutomaticRunningLocal(false);
        if (handlers.isAutomaticSessionActive()) {
          await handlers.endAutomaticSession('mode-switch');
        }
      },
      computeAutomaticStopGraceMs(automatic),
    );
  } catch {
    handlers.setAutomaticRunningLocal(false);
    if (handlers.isAutomaticSessionActive()) {
      await handlers.endAutomaticSession('mode-switch');
    }
  }
}
