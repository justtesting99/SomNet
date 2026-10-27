import type { ActuatorKind, DeviceRegistration } from '@/types/device';

export function actuatorKindLabel(kind: ActuatorKind): string {
  return kind === 'hbridge' ? 'Motor' : 'Relay';
}

/** Short label for history rows — kind when known, else raw id. */
export function formatSessionDeviceLabel(
  deviceId: string | null | undefined,
  registrations: readonly DeviceRegistration[],
  subTarget?: string,
): string {
  if (!deviceId) {
    return 'Legacy session';
  }

  const scoped =
    subTarget !== undefined
      ? registrations.filter((row) => row.subTarget === subTarget)
      : registrations;

  const registration = scoped.find((row) => row.deviceId === deviceId);
  if (!registration) {
    return deviceId;
  }

  return `${actuatorKindLabel(registration.actuatorKind)} · ${deviceId}`;
}
