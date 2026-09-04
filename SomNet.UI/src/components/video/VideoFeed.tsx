import { useDoubleActivate } from '@/hooks/useDoubleActivate';

interface VideoFeedProps {
  label: string;
  src?: string;
  expanded?: boolean;
  onExpand?: () => void;
}

export function VideoFeed({ label, src, expanded = false, onExpand }: VideoFeedProps) {
  const { onDoubleClick, onTouchEnd } = useDoubleActivate(onExpand);
  const isExpandable = Boolean(onExpand);

  return (
    <div
      className={[
        'relative overflow-hidden bg-black',
        expanded
          ? 'aspect-video w-full max-h-full'
          : 'aspect-video w-full',
        isExpandable ? 'cursor-pointer select-none' : '',
      ].join(' ')}
      onDoubleClick={isExpandable ? onDoubleClick : undefined}
      onTouchEnd={isExpandable ? onTouchEnd : undefined}
      title={isExpandable ? 'Double-click or double-tap to expand' : undefined}
      role={isExpandable ? 'button' : undefined}
      tabIndex={isExpandable ? 0 : undefined}
      onKeyDown={
        isExpandable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onExpand?.();
              }
            }
          : undefined
      }
    >
      {src ? (
        <iframe
          src={src}
          title={label}
          className={[
            'absolute inset-0 h-full w-full border-0',
            isExpandable ? 'pointer-events-none' : '',
          ].join(' ')}
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <div className="rounded-full border border-dashed border-slate-600 p-3">
            <svg
              className="h-6 w-6 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-sm text-slate-500">Video feed will appear here</p>
          <p className="text-xs text-slate-600">
            16:9 · 4K-ready · double-click to expand
          </p>
        </div>
      )}
    </div>
  );
}
