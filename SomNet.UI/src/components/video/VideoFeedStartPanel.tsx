import { Button } from '@/components/ui/Button';
import { useOptions } from '@/context/OptionsProvider';
import type { OperationMode } from '@/types/modes';
import type { VideoPreviewControls } from '@/hooks/useSessionVideoSources';
import {
  normalizeMobileVideoExpandDefault,
  usesSingleLiveFeed,
} from '@/utils/liveVideoFeedPreference';

interface VideoFeedStartPanelProps {
  mode: OperationMode;
  preview: VideoPreviewControls;
}

export function VideoFeedStartPanel({ mode, preview }: VideoFeedStartPanelProps) {
  const { options } = useOptions();
  const singleFeed = usesSingleLiveFeed(
    normalizeMobileVideoExpandDefault(options.mobileVideoExpandDefault),
  );

  if (!preview.available) {
    return (
      <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/90">
        Live video is not configured — set <code className="text-amber-100">VITE_VIDEO_FRONT_URL</code>{' '}
        and run <code className="text-amber-100">npm run build</code> in SomNet.UI.
      </div>
    );
  }

  const hint =
    mode === 'manual'
      ? 'Monitor the air tool before stroking. Strokes and bursts use the normal timeout.'
      : singleFeed
        ? 'Monitor the air tool before starting the session. The feed stays up while automatic runs.'
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
          {preview.starting
            ? singleFeed
              ? 'Starting feed…'
              : 'Starting feeds…'
            : singleFeed
              ? 'Start feed'
              : 'Start feeds'}
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
