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
import { AutomaticSessionHubListener } from '@/components/hardware/AutomaticSessionHubListener';
import { SessionRehydrator } from '@/components/hardware/SessionRehydrator';
import { TabSyncProvider } from '@/context/TabSyncProvider';
import { TabSyncBanner } from '@/components/layout/TabSyncBanner';
import { useSessionVideoSources } from '@/hooks/useSessionVideoSources';

function DashboardLayoutWithSessionVideo({ mode }: { mode: 'manual' | 'automatic' }) {
  const { sources, videoPreview } = useSessionVideoSources();

  return (
    <DashboardLayout
      controls={mode === 'manual' ? <ManualControls /> : <AutomaticControls />}
      videoSources={sources}
      mode={mode}
      videoPreview={videoPreview}
    />
  );
}

function DashboardWithVideo({ mode }: { mode: 'manual' | 'automatic' }) {
  return (
    <VideoDisplayProvider>
      <HardwareCommandProvider>
        <DashboardLayoutWithSessionVideo mode={mode} />
      </HardwareCommandProvider>
    </VideoDisplayProvider>
  );
}

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
              <TabSyncProvider>
                <NotifyProvider>
                  <AutomaticSessionHubListener />
                  <SessionRehydrator />
                  <HistoryProvider>
                    <SystemStatusProvider enabled>
                      <AppShell wide={mode !== null}>
                        <TabSyncBanner />
                        {!mode ? (
                          <ModeSelector />
                        ) : (
                          <DashboardWithVideo mode={mode} />
                        )}
                      </AppShell>
                    </SystemStatusProvider>
                  </HistoryProvider>
                </NotifyProvider>
              </TabSyncProvider>
            </OptionsProvider>
          </HardwareProvider>
        </DomSessionsProvider>
      </SessionProvider>
    </SubTargetProvider>
  );
}
