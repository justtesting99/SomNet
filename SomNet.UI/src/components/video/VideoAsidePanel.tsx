import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { MotorPatternGraphPanel } from '@/components/video/MotorPatternGraphPanel';
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

function initialAsideTab(feedsAvailable: boolean, graphAvailable: boolean): AsideTab {
  if (!feedsAvailable && graphAvailable) {
    return 'graph';
  }
  if (feedsAvailable && graphAvailable) {
    const stored = readVideoAsideTab();
    if (stored === 'feeds' || stored === 'graph') {
      return stored;
    }
  }
  return feedsAvailable ? 'feeds' : 'graph';
}

interface VideoAsidePanelProps {
  mode: OperationMode;
  feedsContent: ReactNode;
  feedsAvailable: boolean;
}

export function VideoAsidePanel({ mode, feedsContent, feedsAvailable }: VideoAsidePanelProps) {
  const { selectedDeviceId, selectedRegistration } = useSubDevice();
  const { selectedSub } = useSubTarget();
  const { sessionsByKey } = useLiveSession();

  const isMotorFocus = selectedRegistration?.actuatorKind === 'hbridge';
  const graphAvailable = isMotorFocus && Boolean(selectedDeviceId);

  const panel = useDevicePairingSettings(selectedDeviceId ?? '', 'hbridge');

  const activeSession = useMemo(() => {
    if (!selectedDeviceId) {
      return null;
    }
    return sessionsByKey[sessionDeviceKey(selectedSub, selectedDeviceId)] ?? null;
  }, [selectedDeviceId, selectedSub, sessionsByKey]);

  const [tab, setTab] = useState<AsideTab>(() =>
    initialAsideTab(feedsAvailable, graphAvailable),
  );

  const selectTab = (next: AsideTab) => {
    setTab(next);
    if (feedsAvailable && graphAvailable) {
      writeVideoAsideTab(next);
    }
  };

  useEffect(() => {
    if (!feedsAvailable && graphAvailable) {
      setTab('graph');
    }
  }, [feedsAvailable, graphAvailable]);

  const effectiveTab: AsideTab =
    tab === 'feeds' && !feedsAvailable ? 'graph' : tab === 'graph' && !graphAvailable ? 'feeds' : tab;

  const showTabs = feedsAvailable && graphAvailable;

  const motorAutomaticRunning =
    graphAvailable && mode === 'automatic' && panel.settings.motorAutomatic.running;
  const manualSessionActive =
    graphAvailable && mode === 'manual' && activeSession?.mode === 'manual';
  const showNowMarker = Boolean(motorAutomaticRunning || manualSessionActive);

  if (!feedsAvailable && !graphAvailable) {
    return null;
  }

  return (
    <aside
      className="flex w-full min-w-0 flex-col gap-4 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:self-start"
      aria-label={graphAvailable && !feedsAvailable ? 'Motor pattern graph' : 'Video and pattern graph'}
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

      {effectiveTab === 'graph' && graphAvailable ? (
        <MotorPatternGraphPanel
          mode={mode}
          motorAutomatic={panel.settings.motorAutomatic}
          motorManual={panel.settings.motorManual}
          sessionStartedAtIso={activeSession?.startedAt ?? null}
          showNowMarker={showNowMarker}
        />
      ) : null}
    </aside>
  );
}
