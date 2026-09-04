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
import { NotifyProvider } from '@/context/NotifyProvider';
import { VideoDisplayProvider } from '@/context/VideoDisplayProvider';
import { ModeSelector } from '@/components/modes/ModeSelector';
import { ManualControls } from '@/components/modes/ManualControls';
import { AutomaticControls } from '@/components/modes/AutomaticControls';

export function App() {
  const { isAuthenticated } = useAuth();
  const { mode } = useMode();

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <SubTargetProvider>
      <DomSessionsProvider>
        <OptionsProvider>
          <NotifyProvider>
            <HistoryProvider>
              <SystemStatusProvider enabled>
                <AppShell wide={mode !== null}>
                  {!mode ? (
                    <ModeSelector />
                  ) : (
                    <VideoDisplayProvider>
                      <DashboardLayout
                        controls={mode === 'manual' ? <ManualControls /> : <AutomaticControls />}
                      />
                    </VideoDisplayProvider>
                  )}
                </AppShell>
              </SystemStatusProvider>
            </HistoryProvider>
          </NotifyProvider>
        </OptionsProvider>
      </DomSessionsProvider>
    </SubTargetProvider>
  );
}
