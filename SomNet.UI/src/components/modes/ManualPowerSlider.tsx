import type { InputHTMLAttributes } from 'react';
import { VerticalRangeControl } from '@/components/ui/VerticalRangeControl';

interface ManualPowerSliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> {
  percent: number;
  minimumMs: number;
  maximumMs: number;
  strokeMs: number;
}

export function ManualPowerSlider({
  percent,
  minimumMs,
  maximumMs,
  strokeMs,
  id = 'manual-power',
  ...props
}: ManualPowerSliderProps) {
  const maxMs = Math.max(minimumMs, maximumMs);
  const minMs = Math.min(minimumMs, maximumMs);

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
      <VerticalRangeControl
        id={id}
        label="Power"
        value={percent}
        min={0}
        max={100}
        scaleTop={maxMs}
        scaleBottom={minMs}
        hideValueHeader
        {...props}
      />

      <div className="space-y-4 text-center sm:text-left">
        <div>
          <p className="text-sm text-slate-400">Percent</p>
          <p className="text-2xl font-bold text-white">{percent}</p>
        </div>
        <div>
          <p className="text-sm text-slate-400">Milliseconds</p>
          <p className="text-2xl font-bold text-white">{strokeMs}</p>
        </div>
      </div>
    </div>
  );
}
