import { useEffect, useState } from 'react';
import { fetchSessionHistory } from '@/api/history';
import { fetchSubs } from '@/api/subs';
import { formatSessionDateTime } from '@/utils/history';
import { CONTROLLER_ROLE, SUB_ROLE, type SubTargetName } from '@/config/sessionUsers';
import { useAuth } from '@/context/AuthProvider';
import { useDomSessions } from '@/context/DomSessionsProvider';
import type { SessionHistoryEntry } from '@/types/sessionHistory';
import { Button } from '@/components/ui/Button';

export function DomSessionsDialog() {
  const { isDialogOpen, closeDialog } = useDomSessions();
  const { user } = useAuth();
  const domName = user?.displayName ?? 'Unknown';
  const [subFilter, setSubFilter] = useState<SubTargetName | null>(null);
  const [allSessions, setAllSessions] = useState<SessionHistoryEntry[]>([]);
  const [subsUnderDom, setSubsUnderDom] = useState<SubTargetName[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const sessions = subFilter
    ? allSessions.filter((session) => session.subTarget === subFilter)
    : allSessions;

  useEffect(() => {
    if (isDialogOpen) {
      setSubFilter(null);
    }
  }, [isDialogOpen]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    Promise.all([fetchSessionHistory(domName), fetchSubs()])
      .then(([sessionsResult, subsResult]) => {
        if (!cancelled) {
          setAllSessions(sessionsResult);
          setSubsUnderDom(subsResult);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAllSessions([]);
          setSubsUnderDom([]);
          setLoadError('Unable to load sessions from the API.');
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
  }, [isDialogOpen, domName]);

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
        aria-labelledby="dom-sessions-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-800 px-5 py-4">
          <h2 id="dom-sessions-title" className="text-lg font-semibold text-white">
            {CONTROLLER_ROLE} sessions
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {subFilter
              ? `Showing sessions for ${SUB_ROLE} ${subFilter} under `
              : `All sessions across ${SUB_ROLE}s under `}
            <span className="text-slate-300">{domName}</span>.
          </p>
          {subsUnderDom.length > 0 ? (
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="tablist"
              aria-label={`Filter by ${SUB_ROLE}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={subFilter === null}
                className={[
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  subFilter === null
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
                ].join(' ')}
                onClick={() => setSubFilter(null)}
              >
                All Subs
              </button>
              {subsUnderDom.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  role="tab"
                  aria-selected={subFilter === sub}
                  className={[
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    subFilter === sub
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
                  ].join(' ')}
                  onClick={() => setSubFilter(sub)}
                >
                  {sub}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading sessions…</p>
          ) : loadError ? (
            <p className="text-sm text-red-400">{loadError}</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-slate-500">
              {subFilter
                ? `No sessions recorded for ${SUB_ROLE} ${subFilter}.`
                : `No sessions recorded for this ${CONTROLLER_ROLE}.`}
            </p>
          ) : (
            <ul className="space-y-3">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-white">
                      {formatSessionDateTime(session.startedAt)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {!subFilter ? (
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
                          {SUB_ROLE}: {session.subTarget}
                        </span>
                      ) : null}
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium capitalize text-slate-300">
                        {session.mode}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{session.summary}</p>
                </li>
              ))}
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
