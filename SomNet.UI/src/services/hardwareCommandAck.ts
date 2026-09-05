import type { HardwareCommandKey } from '@/types/hardwareCommand';

const SIMULATED_ACK_MS = 450;

/**
 * Waits until the ESP32 confirms the command payload.
 * Replace with a SignalR ack listener when hardware messaging is wired up.
 */
export async function waitForHardwareAck(_commandKey: HardwareCommandKey): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, SIMULATED_ACK_MS);
  });
}
