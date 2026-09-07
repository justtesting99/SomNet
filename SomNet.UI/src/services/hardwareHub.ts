import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { getAccessToken } from '@/api/client';
import {
  HARDWARE_HUB_COMMAND_ACKNOWLEDGED,
  type HardwareCommandAck,
} from '@/types/hardwareHub';

export type HardwareCommandAckHandler = (ack: HardwareCommandAck) => void;

export function createOperatorHardwareHub(onAck: HardwareCommandAckHandler): HubConnection {
  const connection = new HubConnectionBuilder()
    .withUrl(`${window.location.origin}/hubs/hardware`, {
      accessTokenFactory: () => getAccessToken() ?? '',
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000])
    .configureLogging(import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning)
    .build();

  connection.on(HARDWARE_HUB_COMMAND_ACKNOWLEDGED, (ack: HardwareCommandAck) => {
    onAck(ack);
  });

  return connection;
}

export async function startOperatorHardwareHub(connection: HubConnection): Promise<void> {
  if (connection.state === HubConnectionState.Connected) {
    return;
  }

  await connection.start();
}

export async function stopOperatorHardwareHub(connection: HubConnection): Promise<void> {
  if (connection.state === HubConnectionState.Disconnected) {
    return;
  }

  await connection.stop();
}
