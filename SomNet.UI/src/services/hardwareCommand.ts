import { sendHardwareCommand as sendHardwareCommandApi } from '@/api/devices';
import type { SubTargetName } from '@/config/sessionUsers';
import type { SendHardwareCommandResponse } from '@/types/device';

export class HardwareCommandError extends Error {
  readonly response: SendHardwareCommandResponse;

  constructor(message: string, response: SendHardwareCommandResponse) {
    super(message);
    this.name = 'HardwareCommandError';
    this.response = response;
  }
}

export async function sendHardwareCommand(
  subTarget: SubTargetName,
  deviceId: string,
  commandKey: string,
  payloadJson: string,
  snapshotActionIndex?: number,
): Promise<SendHardwareCommandResponse> {
  const response = await sendHardwareCommandApi(
    subTarget,
    deviceId,
    commandKey,
    payloadJson,
    snapshotActionIndex,
  );

  if (!response.delivered) {
    throw new HardwareCommandError(
      response.message ?? 'Command could not be delivered to the device.',
      response,
    );
  }

  if (!response.acknowledged) {
    throw new HardwareCommandError(
      response.message ?? 'Device did not acknowledge the command in time.',
      response,
    );
  }

  if (!response.success) {
    const raw = response.message ?? 'Device rejected the command.';
    const lower = raw.toLowerCase();
    const message = lower.includes('accesstoken mismatch')
      ? 'Device token is out of date. In Hardware, re-pair this device while the ESP is online (hub connected), then try again.'
      : raw;
    throw new HardwareCommandError(message, response);
  }

  return response;
}
