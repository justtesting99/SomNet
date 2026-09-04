import type { SubTargetName } from '@/config/sessionUsers';
import type {
  HistoryTimelineEntry,
  NotificationHistoryEntry,
  SessionHistoryEntry,
} from '@/types/sessionHistory';

export const MOCK_SESSION_HISTORY: SessionHistoryEntry[] = [
  {
    id: 'sess-001',
    startedAt: '2026-09-04T13:15:00',
    domTarget: 'demo',
    subTarget: 'Slv66',
    mode: 'manual',
    summary: '12 manual strokes, 2 bursts (5 strokes @ 5s delay), 1 abort.',
  },
  {
    id: 'sess-002',
    startedAt: '2026-09-03T20:42:00',
    domTarget: 'demo',
    subTarget: 'Slv66',
    mode: 'automatic',
    summary: 'Automatic session ran 38 minutes, 142 strokes, ended by stroke limit.',
  },
  {
    id: 'sess-003',
    startedAt: '2026-09-02T18:05:00',
    domTarget: 'demo',
    subTarget: 'Slv66',
    mode: 'manual',
    summary: '8 manual strokes at 25–180 ms power range, no bursts.',
  },
  {
    id: 'sess-004',
    startedAt: '2026-09-03T11:20:00',
    domTarget: 'demo',
    subTarget: 'Slv67',
    mode: 'automatic',
    summary: 'Automatic session ran 22 minutes with bursts enabled (10%), stopped manually.',
  },
  {
    id: 'sess-005',
    startedAt: '2026-08-31T22:18:00',
    domTarget: 'demo',
    subTarget: 'Slv67',
    mode: 'manual',
    summary: '5 manual strokes, 1 burst sequence, session aborted by operator.',
  },
  {
    id: 'sess-006',
    startedAt: '2026-09-01T09:30:00',
    domTarget: 'demo',
    subTarget: 'Slv68',
    mode: 'automatic',
    summary: 'Automatic session ran 15 minutes, sensitivity 65%, no auto-end.',
  },
  {
    id: 'sess-007',
    startedAt: '2026-08-30T16:45:00',
    domTarget: 'other-dom',
    subTarget: 'Slv66',
    mode: 'manual',
    summary: 'Session belonging to a different Dom — hidden from this pairing.',
  },
];

export const MOCK_NOTIFICATION_HISTORY: NotificationHistoryEntry[] = [
  {
    id: 'notify-001',
    sentAt: '2026-09-04T09:12:00',
    domTarget: 'demo',
    subTarget: 'Slv66',
    subject: 'Upcoming Session',
    sessionDateTime: '2026-09-04T13:15:00',
  },
  {
    id: 'notify-002',
    sentAt: '2026-09-03T14:30:00',
    domTarget: 'demo',
    subTarget: 'Slv66',
    subject: 'Upcoming Session',
    sessionDateTime: '2026-09-03T20:42:00',
  },
  {
    id: 'notify-003',
    sentAt: '2026-09-02T10:05:00',
    domTarget: 'demo',
    subTarget: 'Slv66',
    subject: 'Upcoming Session',
    sessionDateTime: '2026-09-02T18:05:00',
  },
  {
    id: 'notify-004',
    sentAt: '2026-09-05T08:00:00',
    domTarget: 'demo',
    subTarget: 'Slv66',
    subject: 'Upcoming Session',
    sessionDateTime: '2026-09-06T19:00:00',
  },
  {
    id: 'notify-005',
    sentAt: '2026-09-03T08:45:00',
    domTarget: 'demo',
    subTarget: 'Slv67',
    subject: 'Upcoming Session',
    sessionDateTime: '2026-09-03T11:20:00',
  },
  {
    id: 'notify-006',
    sentAt: '2026-08-31T16:20:00',
    domTarget: 'demo',
    subTarget: 'Slv67',
    subject: 'Upcoming Session',
    sessionDateTime: '2026-08-31T22:18:00',
  },
  {
    id: 'notify-007',
    sentAt: '2026-09-01T07:15:00',
    domTarget: 'demo',
    subTarget: 'Slv68',
    subject: 'Upcoming Session',
    sessionDateTime: '2026-09-01T09:30:00',
  },
  {
    id: 'notify-008',
    sentAt: '2026-08-30T12:00:00',
    domTarget: 'other-dom',
    subTarget: 'Slv66',
    subject: 'Upcoming Session',
    sessionDateTime: '2026-08-30T16:45:00',
  },
];

export function formatSessionDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(isoDate));
}

export function getSessionHistoryForPair(
  domTarget: string,
  subTarget: SubTargetName,
): SessionHistoryEntry[] {
  return MOCK_SESSION_HISTORY.filter(
    (session) =>
      session.domTarget === domTarget && session.subTarget === subTarget,
  ).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export function getNotificationHistoryForPair(
  domTarget: string,
  subTarget: SubTargetName,
): NotificationHistoryEntry[] {
  return MOCK_NOTIFICATION_HISTORY.filter(
    (notification) =>
      notification.domTarget === domTarget && notification.subTarget === subTarget,
  ).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}

function getTimelineSortTime(entry: HistoryTimelineEntry): number {
  if (entry.type === 'session') {
    return new Date(entry.entry.startedAt).getTime();
  }
  return new Date(entry.entry.sentAt).getTime();
}

export function getHistoryTimelineForPair(
  domTarget: string,
  subTarget: SubTargetName,
): HistoryTimelineEntry[] {
  const sessions = getSessionHistoryForPair(domTarget, subTarget).map(
    (entry): HistoryTimelineEntry => ({ type: 'session', entry }),
  );
  const notifications = getNotificationHistoryForPair(domTarget, subTarget).map(
    (entry): HistoryTimelineEntry => ({ type: 'notification', entry }),
  );

  return [...sessions, ...notifications].sort(
    (a, b) => getTimelineSortTime(b) - getTimelineSortTime(a),
  );
}

export function getHistoryEntryDateKey(entry: HistoryTimelineEntry): string {
  if (entry.type === 'session') {
    return entry.entry.startedAt.slice(0, 10);
  }
  return entry.entry.sentAt.slice(0, 10);
}

export function filterHistoryTimelineByDateRange(
  timeline: HistoryTimelineEntry[],
  fromDate: string,
  toDate: string,
): HistoryTimelineEntry[] {
  if (!fromDate && !toDate) {
    return timeline;
  }

  return timeline.filter((item) => {
    const dateKey = getHistoryEntryDateKey(item);
    if (fromDate && dateKey < fromDate) {
      return false;
    }
    if (toDate && dateKey > toDate) {
      return false;
    }
    return true;
  });
}

export function isHistoryDateRangeInvalid(fromDate: string, toDate: string): boolean {
  return Boolean(fromDate && toDate && fromDate > toDate);
}

export function getSessionHistoryForDom(domTarget: string): SessionHistoryEntry[] {
  return MOCK_SESSION_HISTORY.filter((session) => session.domTarget === domTarget).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export function getSubsUnderDom(domTarget: string): SubTargetName[] {
  const subs = new Set<SubTargetName>();
  for (const session of MOCK_SESSION_HISTORY) {
    if (session.domTarget === domTarget) {
      subs.add(session.subTarget);
    }
  }
  return [...subs].sort();
}
