import type { SubTargetName } from '@/config/sessionUsers';
import type { OperationMode } from '@/types/modes';
import type { HardwareCommandKey } from '@/types/hardwareCommand';

export const TAB_SYNC_CHANNEL = 'somnet-tab-sync';

export interface ActiveSessionSnapshot {
  id: string;
  startedAt: string;
  mode: OperationMode;
  subTarget: SubTargetName;
}

export type TabSyncMessage =
  | { type: 'session'; tabId: string; session: ActiveSessionSnapshot | null }
  | { type: 'running'; tabId: string; running: boolean }
  | { type: 'sub'; tabId: string; subTarget: SubTargetName }
  | { type: 'command-lock'; tabId: string; keys: HardwareCommandKey[] }
  | { type: 'request-sync'; tabId: string };

let tabId: string | null = null;
let applyingRemoteSync = false;

type TabSyncListener = (message: TabSyncMessage) => void;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  return new BroadcastChannel(TAB_SYNC_CHANNEL);
}

export function getTabId(): string {
  if (!tabId) {
    tabId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  return tabId;
}

export function isFromSelf(message: TabSyncMessage): boolean {
  return message.tabId === getTabId();
}

export function shouldBroadcastLocalChange(): boolean {
  return !applyingRemoteSync;
}

export function withRemoteSyncApply(action: () => void): void {
  applyingRemoteSync = true;

  try {
    action();
  } finally {
    applyingRemoteSync = false;
  }
}

export async function withRemoteSyncApplyAsync(action: () => void | Promise<void>): Promise<void> {
  applyingRemoteSync = true;

  try {
    await action();
  } finally {
    applyingRemoteSync = false;
  }
}

export function postTabSync(message: TabSyncMessage): void {
  const channel = getBroadcastChannel();
  if (!channel) {
    return;
  }

  channel.postMessage(message);
  channel.close();
}

export function subscribeTabSync(listener: TabSyncListener): () => void {
  const channel = getBroadcastChannel();
  if (!channel) {
    return () => undefined;
  }

  const handler = (event: MessageEvent<TabSyncMessage>) => {
    const message = event.data;
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }

    if (isFromSelf(message)) {
      return;
    }

    listener(message);
  };

  channel.addEventListener('message', handler);

  return () => {
    channel.removeEventListener('message', handler);
    channel.close();
  };
}

export function parseTabSyncMessage(value: unknown): TabSyncMessage | null {
  if (!value || typeof value !== 'object' || !('type' in value) || !('tabId' in value)) {
    return null;
  }

  return value as TabSyncMessage;
}
