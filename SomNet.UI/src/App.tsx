import { useAuth } from '@/context/AuthProvider';
import { LoginForm } from '@/components/auth/LoginForm';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SystemStatusProvider } from '@/context/SystemStatusProvider';
import { SubTargetProvider } from '@/context/SubTargetProvider';
import { SubDeviceProvider } from '@/context/SubDeviceProvider';
import { HistoryProvider } from '@/context/HistoryProvider';
import { DomSessionsProvider } from '@/context/DomSessionsProvider';
import { OptionsProvider } from '@/context/OptionsProvider';
import { HardwareProvider } from '@/context/HardwareProvider';
import { NotifyProvider } from '@/context/NotifyProvider';
import { VideoDisplayProvider } from '@/context/VideoDisplayProvider';
import { SessionProvider } from '@/context/SessionProvider';
import { HardwareCommandProvider } from '@/context/HardwareCommandProvider';
import { DeviceOperationsPanel } from '@/components/modes/DeviceOperationsPanel';
import { DevicePairingSettingsProvider } from '@/context/DevicePairingSettingsProvider';
import { DeviceOperationModeProvider } from '@/context/DeviceOperationModeProvider';
import { AutomaticSessionHubListener } from '@/components/hardware/AutomaticSessionHubListener';
import { SiteUserReadyBanner } from '@/components/hardware/SiteUserReadyBanner';
import { SessionRehydrator } from '@/components/hardware/SessionRehydrator';
import { SiteUserReadyProvider } from '@/context/SiteUserReadyProvider';
import { useSiteUserReadyStartFeed } from '@/hooks/useSiteUserReadyStartFeed';
import { TabSyncProvider } from '@/context/TabSyncProvider';
import { DeviceSceneAccessoryBootstrap } from '@/components/hardware/DeviceSceneAccessoryBootstrap';
import { useSessionVideoSources } from '@/hooks/useSessionVideoSources';
import { useFocusDeviceOperationMode } from '@/hooks/useFocusDeviceOperationMode';

function DashboardLayoutWithSessionVideo() {
  const { sources, videoPreview } = useSessionVideoSources();
  const focusMode = useFocusDeviceOperationMode();
  useSiteUserReadyStartFeed(videoPreview);

  return (
    <>
      <SiteUserReadyBanner />
      <DashboardLayout
        controls={<DeviceOperationsPanel />}
        videoSources={sources}
        mode={focusMode ?? 'manual'}
        videoPreview={videoPreview}
      />
    </>
  );
}

function DashboardWithVideo() {
  return (
    <VideoDisplayProvider>
      <DashboardLayoutWithSessionVideo />
    </VideoDisplayProvider>
  );
}

export function App() {
  const { isAuthenticated, isRestoring } = useAuth();

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
      <SubDeviceProvider>
        <SessionProvider>
          <DomSessionsProvider>
            <HardwareProvider>
              <OptionsProvider>
                <DevicePairingSettingsProvider>
                  <DeviceOperationModeProvider>
                    <TabSyncProvider>
                      <NotifyProvider>
                        <SiteUserReadyProvider>
                          <HardwareCommandProvider>
                            <SystemStatusProvider enabled>
                              <DeviceSceneAccessoryBootstrap />
                              <AutomaticSessionHubListener />
                              <SessionRehydrator />
                              <HistoryProvider>
                                <AppShell wide>
                                  <DashboardWithVideo />
                                </AppShell>
                              </HistoryProvider>
                            </SystemStatusProvider>
                          </HardwareCommandProvider>
                        </SiteUserReadyProvider>
                      </NotifyProvider>
                    </TabSyncProvider>
                  </DeviceOperationModeProvider>
                </DevicePairingSettingsProvider>
              </OptionsProvider>
            </HardwareProvider>
          </DomSessionsProvider>
        </SessionProvider>
      </SubDeviceProvider>
    </SubTargetProvider>
  );
}
