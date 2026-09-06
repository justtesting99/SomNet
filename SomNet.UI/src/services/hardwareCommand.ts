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
  commandKey: string,
  payloadJson: string,
): Promise<SendHardwareCommandResponse> {
  const response = await sendHardwareCommandApi(subTarget, commandKey, payloadJson);

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
    throw new HardwareCommandError(
      response.message ?? 'Device rejected the command.',
      response,
    );
  }

  return response;
}
