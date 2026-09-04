import type { ReactNode } from 'react';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { VideoMonitor } from '@/components/video/VideoMonitor';
import { VideoMaximizeOverlay } from '@/components/video/VideoMaximizeOverlay';
import { Button } from '@/components/ui/Button';

interface DashboardLayoutProps {
  controls: ReactNode;
  videoSources?: [string?, string?];
}

export function DashboardLayout({ controls, videoSources = [] }: DashboardLayoutProps) {
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
            label="Monitor 1"
            src={sources[0]}
            showMaximize={isMobile}
            onMaximize={() => setExpandMode('monitor1')}
          />
          <VideoMonitor
            label="Monitor 2"
            src={sources[1]}
            showMaximize={isMobile}
            onMaximize={() => setExpandMode('monitor2')}
          />
        </aside>
      </div>

      <VideoMaximizeOverlay sources={sources} />
    </>
  );
}
