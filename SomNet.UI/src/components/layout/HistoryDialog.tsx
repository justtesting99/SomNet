import { useEffect, useMemo, useState } from 'react';
import { fetchHistoryTimeline } from '@/api/history';
import {
  filterHistoryTimelineByDateRange,
  formatSessionDateTime,
  isHistoryDateRangeInvalid,
} from '@/utils/history';
import { CONTROLLER_ROLE, SUB_ROLE } from '@/config/sessionUsers';
import { useAuth } from '@/context/AuthProvider';
import { useHistory } from '@/context/HistoryProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import type { HistoryTimelineEntry } from '@/types/sessionHistory';
import { Button } from '@/components/ui/Button';
import { DateRangePicker } from '@/components/ui/DateRangePicker';

export function HistoryDialog() {
  const { isDialogOpen, closeDialog } = useHistory();
  const { selectedSub } = useSubTarget();
  const { user } = useAuth();
  const domName = user?.displayName ?? 'Unknown';
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [timeline, setTimeline] = useState<HistoryTimelineEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const dateRangeInvalid = isHistoryDateRangeInvalid(fromDate, toDate);

  const filteredTimeline = useMemo(() => {
    if (dateRangeInvalid) {
      return [];
    }
    return filterHistoryTimelineByDateRange(timeline, fromDate, toDate);
  }, [timeline, fromDate, toDate, dateRangeInvalid]);

  useEffect(() => {
    if (isDialogOpen) {
      setFromDate('');
      setToDate('');
    }
  }, [isDialogOpen]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    fetchHistoryTimeline(domName, selectedSub)
      .then((entries) => {
        if (!cancelled) {
          setTimeline(entries);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTimeline([]);
          setLoadError('Unable to load history from the API.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDialogOpen, domName, selectedSub]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDialog();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDialogOpen, closeDialog]);

  if (!isDialogOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={closeDialog}
    >
      <div
        className="flex max-h-[min(85dvh,720px)] w-full max-w-2xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="relative z-10 shrink-0 overflow-visible border-b border-slate-800 px-5 py-4">
          <h2 id="history-dialog-title" className="text-lg font-semibold text-white">
            Session history
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Sessions and notifications for {CONTROLLER_ROLE}{' '}
            <span className="text-slate-300">{domName}</span> and {SUB_ROLE}{' '}
            <span className="text-slate-300">{selectedSub}</span> only.
          </p>
          <div className="mt-4">
            <DateRangePicker
              fromDate={fromDate}
              toDate={toDate}
              hint="Pick a start and end date, or apply with only one side for an open range."
              error={
                dateRangeInvalid ? 'Start date must be on or before the end date.' : undefined
              }
              onFromDateChange={setFromDate}
              onToDateChange={setToDate}
              onClear={() => {
                setFromDate('');
                setToDate('');
              }}
            />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading history…</p>
          ) : loadError ? (
            <p className="text-sm text-red-400">{loadError}</p>
          ) : timeline.length === 0 ? (
            <p className="text-sm text-slate-500">
              No past sessions or notifications recorded for this {CONTROLLER_ROLE} and {SUB_ROLE}{' '}
              pairing.
            </p>
          ) : filteredTimeline.length === 0 ? (
            <p className="text-sm text-slate-500">
              {dateRangeInvalid
                ? 'Adjust the date range to view history.'
                : 'No sessions or notifications fall within the selected date range.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {filteredTimeline.map((item) => {
                if (item.type === 'session') {
                  const session = item.entry;
                  return (
                    <li
                      key={session.id}
                      className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-white">
                          {formatSessionDateTime(session.startedAt)}
                        </p>
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium capitalize text-slate-300">
                          {session.mode}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-400">
                        {session.summary}
                      </p>
                    </li>
                  );
                }

                const notification = item.entry;
                return (
                  <li
                    key={notification.id}
                    className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white">
                        Notification sent {formatSessionDateTime(notification.sentAt)}
                      </p>
                      <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-200">
                        Notification
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{notification.subject}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      Scheduled session: {formatSessionDateTime(notification.sessionDateTime)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-800 px-5 py-4">
          <div className="flex justify-end">
            <Button variant="secondary" onClick={closeDialog}>
              Close
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
