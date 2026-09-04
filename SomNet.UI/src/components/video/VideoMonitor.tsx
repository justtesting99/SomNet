import { Button } from '@/components/ui/Button';
import { VideoFeed } from '@/components/video/VideoFeed';

interface VideoMonitorProps {
  label: string;
  src?: string;
  onMaximize?: () => void;
  showMaximize?: boolean;
}

/** Viewport sized for 16:9 feeds (e.g. 3840×2160 / 1080p webcams). */
export function VideoMonitor({ label, src, onMaximize, showMaximize = false }: VideoMonitorProps) {
  return (
    <section className="w-full overflow-hidden rounded-xl border border-slate-700/90 bg-slate-900/60">
      <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</h2>
        {showMaximize && onMaximize ? (
          <Button variant="ghost" size="sm" onClick={onMaximize} aria-label={`Maximize ${label}`}>
            Maximize
          </Button>
        ) : null}
      </header>

      <VideoFeed label={label} src={src} onExpand={onMaximize} />
    </section>
  );
}
