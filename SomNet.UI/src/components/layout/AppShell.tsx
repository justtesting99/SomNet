import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { readDeviceSceneSessionActive } from '@/utils/sessionAccessoryStorage';
import { Button } from '@/components/ui/Button';
import { SystemStatusDisplay } from '@/components/layout/SystemStatusDisplay';
import { SessionUsers } from '@/components/layout/SessionUsers';
import { SubSelectionDialog } from '@/components/layout/SubSelectionDialog';
import { HistoryDialog } from '@/components/layout/HistoryDialog';
import { DomSessionsDialog } from '@/components/layout/DomSessionsDialog';
import { OptionsDialog } from '@/components/layout/OptionsDialog';
import { HardwareDialog } from '@/components/layout/HardwareDialog';
import { NotifyDialog } from '@/components/layout/NotifyDialog';
import { useHistory } from '@/context/HistoryProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useHardwareDialog } from '@/context/HardwareProvider';
import { useNotify } from '@/context/NotifyProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { SubSessionControls } from '@/components/hardware/SubSessionControls';

interface AppShellProps {
  children: ReactNode;
  wide?: boolean;
}

export function AppShell({ children, wide = false }: AppShellProps) {
  const { user, logout } = useAuth();
  const { openDialog: openHistory } = useHistory();
  const { openDialog: openOptions } = useOptions();
  const { openDialog: openHardware } = useHardwareDialog();
  const { openDialog: openNotify } = useNotify();
  const { selectedSub } = useSubTarget();
  const { registrations } = useSubDevice();
  const multiDevice = registrations.length > 1;
  const domTarget = user?.displayName ?? user?.username ?? '';

  function anyDeviceSceneSessionActive(): boolean {
    if (!domTarget) {
      return false;
    }

    return registrations.some((registration) =>
      readDeviceSceneSessionActive(domTarget, selectedSub, registration.deviceId),
    );
  }

  async function handleSignOut() {
    if (anyDeviceSceneSessionActive()) {
      return;
    }

    logout();
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.18),_transparent_45%)]" />

      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div
          className={[
            'mx-auto min-w-0 px-4 py-3 sm:px-6',
            wide ? 'max-w-[1600px]' : 'max-w-5xl',
          ].join(' ')}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-2">
              <SessionUsers controllerName={user?.displayName ?? 'Unknown'} />
            </div>

            <div className="flex min-w-0 items-center gap-2 lg:flex-1 lg:px-2">
              <Button variant="ghost" size="sm" className="shrink-0" onClick={openNotify}>
                Notify
              </Button>
              {!multiDevice ? (
                <div className="shrink-0">
                  <SubSessionControls />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <SystemStatusDisplay />
              </div>
            </div>

            <div className="flex min-w-0 w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:justify-end">
              <Button variant="ghost" size="sm" className="shrink-0" onClick={openHardware}>
                Hardware
              </Button>
              <Button variant="ghost" size="sm" className="shrink-0" onClick={openHistory}>
                History
              </Button>
              <Button variant="ghost" size="sm" className="shrink-0" onClick={openOptions}>
                Options
              </Button>
              <Button variant="secondary" size="sm" className="shrink-0" onClick={() => void handleSignOut()}>
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main
        className={[
          'relative mx-auto min-w-0 px-4 py-6 sm:px-6 sm:py-8',
          wide ? 'max-w-[1600px]' : 'max-w-5xl',
        ].join(' ')}
      >
        {children}
      </main>

      <SubSelectionDialog />
      <HistoryDialog />
      <DomSessionsDialog />
      <OptionsDialog />
      <HardwareDialog />
      <NotifyDialog />
    </div>
  );
}
