import { useSystemStatus } from '@/context/SystemStatusProvider';
import { getOverallTone } from '@/utils/systemStatus';

const toneStyles = {
  ready: {
    dot: 'bg-emerald-400 shadow-emerald-400/40',
    border: 'border-emerald-500/30 bg-emerald-500/10',
    text: 'text-emerald-300',
  },
  warning: {
    dot: 'bg-amber-400 shadow-amber-400/40',
    border: 'border-amber-500/30 bg-amber-500/10',
    text: 'text-amber-300',
  },
  error: {
    dot: 'bg-red-400 shadow-red-400/40',
    border: 'border-red-500/30 bg-red-500/10',
    text: 'text-red-300',
  },
  checking: {
    dot: 'bg-slate-400 shadow-slate-400/40',
    border: 'border-slate-600/50 bg-slate-800/60',
    text: 'text-slate-300',
  },
} as const;

export function SystemStatusDisplay() {
  const { status } = useSystemStatus();
  const tone = getOverallTone(status);
  const styles = toneStyles[tone];

  return (
    <div
      className={['min-w-0 rounded-xl border px-3 py-1.5', styles.border].join(' ')}
      title={status.detail}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={[
            'h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_8px]',
            styles.dot,
          ].join(' ')}
          aria-hidden="true"
        />
        <p className="min-w-0 truncate text-sm">
          <span className="text-slate-400">Status: </span>
          <span className={`font-medium ${styles.text}`}>{status.summary}</span>
        </p>
      </div>
    </div>
  );
}
