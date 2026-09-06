import { useAuth } from '@/context/AuthProvider';
import { useMode } from '@/context/ModeProvider';
import { LoginForm } from '@/components/auth/LoginForm';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SystemStatusProvider } from '@/context/SystemStatusProvider';
import { SubTargetProvider } from '@/context/SubTargetProvider';
import { HistoryProvider } from '@/context/HistoryProvider';
import { DomSessionsProvider } from '@/context/DomSessionsProvider';
import { OptionsProvider } from '@/context/OptionsProvider';
import { HardwareProvider } from '@/context/HardwareProvider';
import { NotifyProvider } from '@/context/NotifyProvider';
import { VideoDisplayProvider } from '@/context/VideoDisplayProvider';
import { SessionProvider } from '@/context/SessionProvider';
import { HardwareCommandProvider } from '@/context/HardwareCommandProvider';
import { ModeSelector } from '@/components/modes/ModeSelector';
import { ManualControls } from '@/components/modes/ManualControls';
import { AutomaticControls } from '@/components/modes/AutomaticControls';

export function App() {
  const { isAuthenticated, isRestoring } = useAuth();
  const { mode } = useMode();

  if (isRestoring) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-sm text-slate-400">
        Restoring session…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <SubTargetProvider>
      <SessionProvider>
        <DomSessionsProvider>
          <HardwareProvider>
            <OptionsProvider>
              <NotifyProvider>
                <HistoryProvider>
                  <SystemStatusProvider enabled>
                    <AppShell wide={mode !== null}>
                      {!mode ? (
                        <ModeSelector />
                      ) : (
                        <VideoDisplayProvider>
                          <HardwareCommandProvider>
                            <DashboardLayout
                              controls={
                                mode === 'manual' ? <ManualControls /> : <AutomaticControls />
                              }
                            />
                          </HardwareCommandProvider>
                        </VideoDisplayProvider>
                      )}
                    </AppShell>
                  </SystemStatusProvider>
                </HistoryProvider>
              </NotifyProvider>
            </OptionsProvider>
          </HardwareProvider>
        </DomSessionsProvider>
      </SessionProvider>
    </SubTargetProvider>
  );
}
