import { CONTROLLER_ROLE, SUB_ROLE } from '@/config/sessionUsers';
import { useDomSessions } from '@/context/DomSessionsProvider';
import { useSubTarget } from '@/context/SubTargetProvider';

interface SessionUsersProps {
  controllerName: string;
  modeLabel?: string;
}

export function SessionUsers({ controllerName, modeLabel }: SessionUsersProps) {
  const { selectedSub, openDialog: openSubDialog } = useSubTarget();
  const { openDialog: openDomSessions } = useDomSessions();

  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">
        SomNet
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <button
          type="button"
          className="group inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-left text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white"
          onClick={openDomSessions}
          aria-label={`View all ${CONTROLLER_ROLE} sessions for ${controllerName}`}
        >
          <span className="font-medium text-slate-400 group-hover:text-slate-300">
            {CONTROLLER_ROLE}:
          </span>{' '}
          <span className="font-semibold text-white underline decoration-slate-600 underline-offset-2 group-hover:decoration-indigo-400">
            {controllerName}
          </span>
        </button>
        <span className="hidden text-slate-600 sm:inline" aria-hidden="true">
          |
        </span>
        <button
          type="button"
          className="group inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-left text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white"
          onClick={openSubDialog}
          aria-label={`Change ${SUB_ROLE} target, currently ${selectedSub}`}
        >
          <span className="font-medium text-slate-400 group-hover:text-slate-300">{SUB_ROLE}:</span>{' '}
          <span className="font-semibold text-white underline decoration-slate-600 underline-offset-2 group-hover:decoration-indigo-400">
            {selectedSub}
          </span>
        </button>
        {modeLabel ? (
          <>
            <span className="hidden text-slate-600 md:inline" aria-hidden="true">
              |
            </span>
            <p className="text-slate-500">{modeLabel}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
