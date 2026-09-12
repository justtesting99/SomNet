import type { ReactNode } from 'react';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { VideoMonitor } from '@/components/video/VideoMonitor';
import { VideoMaximizeOverlay } from '@/components/video/VideoMaximizeOverlay';
import { Button } from '@/components/ui/Button';
import { VideoFeedStartPanel } from '@/components/video/VideoFeedStartPanel';
import { REAR_VIDEO_LOAD_DELAY_MS } from '@/config/videoSources';
import type { VideoPreviewControls } from '@/hooks/useSessionVideoSources';
import type { OperationMode } from '@/types/modes';

interface DashboardLayoutProps {
  controls: ReactNode;
  videoSources?: [string?, string?];
  mode: OperationMode;
  videoPreview?: VideoPreviewControls;
}

export function DashboardLayout({
  controls,
  videoSources = [],
  mode,
  videoPreview,
}: DashboardLayoutProps) {
  const isMobile = useIsMobileViewport();
  const { setExpandMode } = useVideoDisplay();
  const sources: [string?, string?] = [videoSources[0], videoSources[1]];

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="min-w-0">{controls}</div>

        <aside
          className="flex w-full min-w-0 flex-col gap-4 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:self-start"
          aria-label="Video monitors"
        >
          {videoPreview ? <VideoFeedStartPanel mode={mode} preview={videoPreview} /> : null}

          {isMobile ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
              <p className="text-xs text-slate-400">
                Double-tap a feed to expand, or use Both
              </p>
              <Button variant="secondary" size="sm" onClick={() => setExpandMode('both')}>
                Both
              </Button>
            </div>
          ) : null}

          <VideoMonitor
            label="Front"
            src={sources[0]}
            showMaximize={isMobile}
            onMaximize={() => setExpandMode('monitor1')}
            loadDelayMs={0}
          />
          <VideoMonitor
            label="Rear"
            src={sources[1]}
            showMaximize={isMobile}
            onMaximize={() => setExpandMode('monitor2')}
            loadDelayMs={sources[0] && sources[1] ? REAR_VIDEO_LOAD_DELAY_MS : 0}
          />
        </aside>
      </div>

      <VideoMaximizeOverlay sources={sources} />
    </>
  );
}
