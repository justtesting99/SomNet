import { useLiveSession } from '@/context/SessionProvider';
import { useSessionAccessory } from '@/context/SessionAccessoryProvider';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { useOptions } from '@/context/OptionsProvider';

function HeaderToggle({
  label,
  shortLabel,
  active,
  disabled,
  pending,
  disabledReason,
  ariaLabel,
  dataUi,
  onToggle,
  toneActive,
}: {
  label: string;
  shortLabel: string;
  active: boolean;
  disabled: boolean;
  pending: boolean;
  disabledReason?: string;
  ariaLabel: string;
  dataUi: string;
  onToggle: () => void;
  toneActive: 'indigo' | 'amber';
}) {
  const activeBorder =
    toneActive === 'indigo' ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-100';
  const activeKnob =
    toneActive === 'indigo' ? 'border-indigo-400 bg-indigo-500' : 'border-amber-400 bg-amber-500';
  const activeText =
    toneActive === 'indigo' ? 'text-indigo-300' : 'text-amber-200';

  return (
    <div
      className={[
        'flex min-w-0 flex-col gap-1 rounded-xl border px-3 py-1.5 text-sm',
        active ? activeBorder : 'border-slate-600/50 bg-slate-800/60 text-slate-300',
        disabled || pending ? 'opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={disabledReason}
      data-ui={dataUi}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden min-w-0 truncate font-medium sm:inline">{label}</span>
        <span className="min-w-0 truncate font-medium sm:hidden">{shortLabel}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={[
              'text-[10px] font-semibold uppercase tracking-wide',
              active ? activeText : 'text-slate-500',
            ].join(' ')}
            aria-hidden="true"
          >
            {active ? 'On' : 'Off'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-label={ariaLabel}
            disabled={disabled || pending}
            title={disabledReason}
            className={[
              'relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
              active ? activeKnob : 'border-slate-500 bg-slate-700',
              disabled || pending ? 'cursor-not-allowed' : 'cursor-pointer',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={onToggle}
          >
            <span
              className={[
                'pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform',
                active ? 'translate-x-5' : 'translate-x-0',
              ].join(' ')}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      {disabledReason ? (
        <p className="text-xs text-amber-200/90" title={disabledReason}>{disabledReason}</p>
      ) : null}
    </div>
  );
}

export function SubSessionControls() {
  const { activeSession } = useLiveSession();
  const { options } = useOptions();
  const { selectedSub } = useSubTarget();
  const { selectedDeviceId } = useSubDevice();
  const { dismissReadyBannerForSub } = useSiteUserReady();
  const {
    sceneSessionActive,
    accessoryEngaged,
    sceneSwitchDisabled,
    sceneSwitchDisabledReason,
    accessorySwitchDisabled,
    accessorySwitchDisabledReason,
    sceneTogglePending,
    accessoryTogglePending,
    sceneSessionError,
    accessoryError,
    setSceneSessionActive,
    setAccessoryEngaged,
  } = useSessionAccessory();

  const deviceShort = selectedDeviceId ? `${selectedDeviceId.slice(0, 8)}…` : null;
  const sceneLabel = deviceShort ? `Scene (${deviceShort})` : 'Scene session';
  const accessoryLabel = deviceShort ? `Accessory (${deviceShort})` : 'Accessory';

  return (
    <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start">
      <HeaderToggle
        label={sceneLabel}
        shortLabel="Scene"
        active={sceneSessionActive}
        disabled={sceneSwitchDisabled}
        pending={sceneTogglePending}
        disabledReason={sceneSessionError || sceneSwitchDisabledReason}
        ariaLabel="Scene session"
        dataUi="scene-session-switch"
        toneActive="indigo"
        onToggle={() => {
          const turningOn = !sceneSessionActive;
          if (turningOn) {
            dismissReadyBannerForSub(selectedSub);
          }
          void setSceneSessionActive(turningOn);
        }}
      />
      <HeaderToggle
        label={accessoryLabel}
        shortLabel="Accessory"
        active={accessoryEngaged}
        disabled={accessorySwitchDisabled}
        pending={accessoryTogglePending}
        disabledReason={accessoryError || accessorySwitchDisabledReason}
        ariaLabel="Accessory output"
        dataUi="device-accessory-switch"
        toneActive="amber"
        onToggle={() => {
          void setAccessoryEngaged(!accessoryEngaged);
        }}
      />
      {options.showActiveSessionIdInHeader && sceneSessionActive && activeSession ? (
        <p
          className="min-w-0 self-center truncate font-mono text-xs text-indigo-100 lg:max-w-[12rem]"
          title="Active session id"
        >
          <span className="font-sans text-slate-400">ID </span>
          {activeSession.id}
        </p>
      ) : null}
    </div>
  );
}

/** @deprecated Use SubSessionControls */
export function SessionInProgressSwitch() {
  return <SubSessionControls />;
}
