import { CONTROLLER_ROLE, SUB_ROLE } from '@/config/sessionUsers';
import { useDomSessions } from '@/context/DomSessionsProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';

interface SessionUsersProps {
  controllerName: string;
  modeLabel?: string;
}

export function SessionUsers({ controllerName, modeLabel }: SessionUsersProps) {
  const { selectedSub, openDialog: openSubDialog } = useSubTarget();
  const { registrations, selectedDeviceId, setSelectedDeviceId } = useSubDevice();
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
        {registrations.length > 1 ? (
          <>
            <span className="hidden text-slate-600 sm:inline" aria-hidden="true">
              |
            </span>
            <label className="inline-flex items-center gap-1 text-sm text-slate-300">
              <span className="font-medium text-slate-400">Device:</span>
              <select
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-0.5 text-sm text-white"
                value={selectedDeviceId ?? ''}
                onChange={(event) => setSelectedDeviceId(event.target.value || null)}
              >
                {registrations.map((registration) => (
                  <option key={registration.deviceId} value={registration.deviceId}>
                    {registration.deviceId} ({registration.actuatorKind})
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
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
