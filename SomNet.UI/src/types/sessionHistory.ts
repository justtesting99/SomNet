import type { SubTargetName } from '@/config/sessionUsers';

export interface SessionHistoryEntry {
  id: string;
  startedAt: string;
  domTarget: string;
  subTarget: SubTargetName;
  mode: 'manual' | 'automatic';
  summary: string;
}

export interface NotificationHistoryEntry {
  id: string;
  sentAt: string;
  domTarget: string;
  subTarget: SubTargetName;
  subject: string;
  sessionDateTime: string;
}

export type HistoryTimelineEntry =
  | { type: 'session'; entry: SessionHistoryEntry }
  | { type: 'notification'; entry: NotificationHistoryEntry };
