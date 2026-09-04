import type { HistoryTimelineEntry } from '@/types/sessionHistory';

export function formatSessionDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(isoDate));
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
