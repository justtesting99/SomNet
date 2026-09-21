import { useLiveSession } from '@/context/SessionProvider';
import { useSessionAccessory } from '@/context/SessionAccessoryProvider';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useOptions } from '@/context/OptionsProvider';

export function SessionInProgressSwitch() {
  const { activeSession } = useLiveSession();
  const { options } = useOptions();
  const { selectedSub } = useSubTarget();
  const { dismissReadyBannerForSub } = useSiteUserReady();
  const {
    sessionInProgress,
    switchDisabled,
    switchDisabledReason,
    setSessionInProgress,
    togglePending,
  } = useSessionAccessory();

  const disabled = switchDisabled || togglePending;

  return (
    <div
      className={[
        'flex min-w-0 flex-col gap-1 rounded-xl border px-3 py-1.5 text-sm',
        sessionInProgress
          ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
          : 'border-slate-600/50 bg-slate-800/60 text-slate-300',
        disabled ? 'opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={switchDisabledReason}
      data-ui="session-in-progress-slide"
    >
      <div className="flex min-w-0 items-center gap-2">
      <span className="hidden min-w-0 truncate font-medium sm:inline">Session in Progress</span>
      <span className="min-w-0 truncate font-medium sm:hidden">Session</span>
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={[
            'text-[10px] font-semibold uppercase tracking-wide',
            sessionInProgress ? 'text-indigo-300' : 'text-slate-500',
          ].join(' ')}
          aria-hidden="true"
        >
          {sessionInProgress ? 'On' : 'Off'}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={sessionInProgress}
          aria-label="Session in Progress"
          disabled={disabled}
          title={switchDisabledReason}
          className={[
            'relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
            sessionInProgress
              ? 'border-indigo-400 bg-indigo-500'
              : 'border-slate-500 bg-slate-700',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => {
            const turningOn = !sessionInProgress;
            if (turningOn) {
              dismissReadyBannerForSub(selectedSub);
            }
            void setSessionInProgress(turningOn);
          }}
        >
          <span
            className={[
              'pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform',
              sessionInProgress ? 'translate-x-5' : 'translate-x-0',
            ].join(' ')}
            aria-hidden="true"
          />
        </button>
      </div>
      </div>
      {options.showActiveSessionIdInHeader && sessionInProgress && activeSession ? (
        <p className="min-w-0 truncate font-mono text-xs text-indigo-100" title="Active session id">
          <span className="font-sans text-slate-400">ID </span>
          {activeSession.id}
        </p>
      ) : null}
    </div>
  );
}
