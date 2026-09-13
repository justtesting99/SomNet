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
import {
  HARDWARE_HUB_BUTTON_EVENT_RECEIVED,
  type DeviceButtonEvent,
} from '@/types/deviceButtonEvent';

export type HardwareCommandAckHandler = (ack: HardwareCommandAck) => void;
export type DeviceButtonEventHandler = (event: DeviceButtonEvent) => void;

export interface OperatorHardwareHubHandlers {
  onAck?: HardwareCommandAckHandler;
  onButtonEvent?: DeviceButtonEventHandler;
}

export function createOperatorHardwareHub(handlers: OperatorHardwareHubHandlers): HubConnection {
  const connection = new HubConnectionBuilder()
    .withUrl(`${window.location.origin}/hubs/hardware`, {
      accessTokenFactory: () => getAccessToken() ?? '',
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000])
    .configureLogging(import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning)
    .build();

  if (handlers.onAck) {
    connection.on(HARDWARE_HUB_COMMAND_ACKNOWLEDGED, (ack: HardwareCommandAck) => {
      handlers.onAck?.(ack);
    });
  }

  if (handlers.onButtonEvent) {
    connection.on(HARDWARE_HUB_BUTTON_EVENT_RECEIVED, (event: DeviceButtonEvent) => {
      handlers.onButtonEvent?.(event);
    });
  }

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
