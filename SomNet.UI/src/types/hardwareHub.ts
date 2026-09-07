/** Matches device firmware + SomNet.Shared HardwareCommandAckDto. */
export interface HardwareCommandAck {
  correlationId: string;
  success: boolean;
  message?: string | null;
  resultJson?: string | null;
}

/** Unsolicited automatic session complete (end-rule / abort) — not tied to automatic-stop REST. */
export const AUTOMATIC_SESSION_COMPLETE_CORRELATION_ID = 'automatic-session-complete';

export const HARDWARE_HUB_COMMAND_ACKNOWLEDGED = 'CommandAcknowledged';
