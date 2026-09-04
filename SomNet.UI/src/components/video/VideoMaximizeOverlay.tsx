import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { Button } from '@/components/ui/Button';
import { VideoFeed } from '@/components/video/VideoFeed';

interface VideoMaximizeOverlayProps {
  sources: [string?, string?];
}

export function VideoMaximizeOverlay({ sources }: VideoMaximizeOverlayProps) {
  const { expandMode, closeExpanded } = useVideoDisplay();

  if (expandMode === 'none') {
    return null;
  }

  const showMonitor1 = expandMode === 'monitor1' || expandMode === 'both';
  const showMonitor2 = expandMode === 'monitor2' || expandMode === 'both';
  const isSingle = expandMode === 'monitor1' || expandMode === 'monitor2';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Expanded video monitors"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {expandMode === 'monitor1'
              ? 'Monitor 1'
              : expandMode === 'monitor2'
                ? 'Monitor 2'
                : 'Video monitors'}
          </p>
          <p className="text-xs text-slate-400">
            Full width · 16:9 · Esc to close
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={closeExpanded}>
          Close
        </Button>
      </header>

      <div
        className={[
          'flex min-h-0 flex-1 w-full bg-black',
          isSingle
            ? 'flex items-center justify-center px-3 sm:px-4'
            : 'flex-col gap-3 overflow-y-auto py-3',
        ].join(' ')}
      >
        {showMonitor1 ? (
          <div
            className={
              isSingle
                ? 'flex h-full w-full max-w-full items-center justify-center'
                : 'flex w-full shrink-0 items-center justify-center px-3 sm:px-4'
            }
          >
            <VideoFeed label="Monitor 1" src={sources[0]} expanded />
          </div>
        ) : null}
        {showMonitor2 ? (
          <div
            className={
              isSingle
                ? 'flex h-full w-full max-w-full items-center justify-center'
                : 'flex w-full shrink-0 items-center justify-center px-3 sm:px-4'
            }
          >
            <VideoFeed label="Monitor 2" src={sources[1]} expanded />
          </div>
        ) : null}
      </div>
    </div>
  );
}
