import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { MotorPatternGraphPanel } from '@/components/video/MotorPatternGraphPanel';
import { RelayPatternGraphPanel } from '@/components/video/RelayPatternGraphPanel';
import { useDevicePairingSettings } from '@/context/DevicePairingSettingsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import type { OperationMode } from '@/types/modes';
import { sessionDeviceKey } from '@/utils/sessionDeviceKey';
import {
  readVideoAsideTab,
  writeVideoAsideTab,
  type VideoAsideTab,
} from '@/utils/videoAsideTabStorage';

type AsideTab = VideoAsideTab;

interface VideoAsidePanelProps {
  mode: OperationMode;
  feedsContent: ReactNode;
  feedsAvailable: boolean;
}

export function VideoAsidePanel({ mode, feedsContent, feedsAvailable }: VideoAsidePanelProps) {
  const { selectedDeviceId, selectedRegistration, isLoading: devicesLoading } = useSubDevice();
  const { selectedSub } = useSubTarget();
  const { sessionsByKey } = useLiveSession();

  const actuatorKind = selectedRegistration?.actuatorKind;
  const graphAvailable =
    Boolean(selectedDeviceId) && (actuatorKind === 'hbridge' || actuatorKind === 'relay');

  const motorPanel = useDevicePairingSettings(selectedDeviceId ?? '', 'hbridge');
  const relayPanel = useDevicePairingSettings(selectedDeviceId ?? '', 'relay');

  const activeSession = useMemo(() => {
    if (!selectedDeviceId) {
      return null;
    }
    return sessionsByKey[sessionDeviceKey(selectedSub, selectedDeviceId)] ?? null;
  }, [selectedDeviceId, selectedSub, sessionsByKey]);

  const showTabs = feedsAvailable && graphAvailable;

  const [tab, setTab] = useState<AsideTab>('feeds');
  const storedTabAppliedRef = useRef(false);

  useEffect(() => {
    storedTabAppliedRef.current = false;
  }, [selectedSub]);

  useEffect(() => {
    if (devicesLoading) {
      return;
    }

    if (!feedsAvailable && graphAvailable) {
      setTab('graph');
      return;
    }

    if (!showTabs) {
      if (feedsAvailable && !graphAvailable) {
        setTab('feeds');
      }
      return;
    }

    if (storedTabAppliedRef.current) {
      return;
    }

    storedTabAppliedRef.current = true;
    const stored = readVideoAsideTab();
    if (stored === 'feeds' || stored === 'graph') {
      setTab(stored);
    }
  }, [devicesLoading, feedsAvailable, graphAvailable, showTabs]);

  const selectTab = (next: AsideTab) => {
    setTab(next);
    writeVideoAsideTab(next);
  };

  const effectiveTab: AsideTab =
    tab === 'feeds' && !feedsAvailable ? 'graph' : tab === 'graph' && !graphAvailable ? 'feeds' : tab;

  const automaticRunning =
    graphAvailable &&
    mode === 'automatic' &&
    (actuatorKind === 'hbridge'
      ? motorPanel.settings.motorAutomatic.running
      : relayPanel.settings.automatic.running);
  const manualSessionActive =
    graphAvailable && mode === 'manual' && activeSession?.mode === 'manual';
  const showNowMarker = Boolean(automaticRunning || manualSessionActive);

  const asideLabel =
    graphAvailable && !feedsAvailable ? 'Automatic pattern graph' : 'Video and pattern graph';

  if (!feedsAvailable && !graphAvailable) {
    return null;
  }

  return (
    <aside
      className="flex w-full min-w-0 flex-col gap-4 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:self-start"
      aria-label={asideLabel}
    >
      {showTabs ? (
        <div
          className="flex gap-1 rounded-lg border border-slate-800 bg-slate-950/40 p-1"
          role="tablist"
          aria-label="Video column"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'feeds'}
            variant={effectiveTab === 'feeds' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1"
            onClick={() => selectTab('feeds')}
          >
            Feeds
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'graph'}
            variant={effectiveTab === 'graph' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1"
            onClick={() => selectTab('graph')}
          >
            Graph
          </Button>
        </div>
      ) : null}

      {effectiveTab === 'feeds' && feedsAvailable ? feedsContent : null}

      {effectiveTab === 'graph' && graphAvailable && actuatorKind === 'hbridge' ? (
        <MotorPatternGraphPanel
          mode={mode}
          motorAutomatic={motorPanel.settings.motorAutomatic}
          motorManual={motorPanel.settings.motorManual}
          sessionStartedAtIso={activeSession?.startedAt ?? null}
          showNowMarker={showNowMarker}
        />
      ) : null}

      {effectiveTab === 'graph' && graphAvailable && actuatorKind === 'relay' ? (
        <RelayPatternGraphPanel
          mode={mode}
          automatic={relayPanel.settings.automatic}
          manual={relayPanel.settings.manual}
          sessionStartedAtIso={activeSession?.startedAt ?? null}
          showNowMarker={showNowMarker}
        />
      ) : null}
    </aside>
  );
}
