import { Button } from '@/components/ui/Button';
import type { OperationMode } from '@/types/modes';
import type { VideoPreviewControls } from '@/hooks/useSessionVideoSources';

interface VideoFeedStartPanelProps {
  mode: OperationMode;
  preview: VideoPreviewControls;
}

export function VideoFeedStartPanel({ mode, preview }: VideoFeedStartPanelProps) {
  if (!preview.available) {
    return null;
  }

  const hint =
    mode === 'manual'
      ? 'Monitor the air tool before stroking. Strokes and bursts use the normal timeout.'
      : 'Monitor the air tool before starting the session. Feeds stay up while automatic runs.';

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!preview.canStart}
          aria-busy={preview.starting}
          onClick={() => void preview.start()}
        >
          {preview.starting ? 'Starting feeds…' : 'Start feeds'}
        </Button>
        {preview.previewActive ? (
          <span className="text-xs text-emerald-400/90" role="status">
            Preview — auto-hide after {preview.previewTimeoutSeconds}s
          </span>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        {hint} Preview uses 2× your video feed timeout ({preview.previewTimeoutSeconds}s).
      </p>
    </div>
  );
}
