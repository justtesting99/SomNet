/** Matches device firmware + SomNet.Shared HardwareCommandAckDto. */
export interface HardwareCommandAck {
  correlationId: string;
  success: boolean;
  message?: string | null;
  resultJson?: string | null;
  /** Set by API when forwarding device acks to operators (V2 multi-device). */
  deviceId?: string | null;
}

/** Unsolicited automatic session complete (end-rule / abort) — not tied to automatic-stop REST. */
export const AUTOMATIC_SESSION_COMPLETE_CORRELATION_ID = 'automatic-session-complete';

/** Device-reported motor automatic segment ramp (commanded speeds). */
export const MOTOR_AUTOMATIC_SEGMENT_CORRELATION_ID = 'motor-automatic-segment';

/** Device-reported relay automatic stroke/gap interval (commanded power). */
export const RELAY_AUTOMATIC_SEGMENT_CORRELATION_ID = 'relay-automatic-segment';

export const HARDWARE_HUB_COMMAND_ACKNOWLEDGED = 'CommandAcknowledged';
