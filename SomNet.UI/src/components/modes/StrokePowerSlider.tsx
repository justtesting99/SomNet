import type { InputHTMLAttributes } from 'react';
import { VerticalRangeControl } from '@/components/ui/VerticalRangeControl';

interface StrokePowerSliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> {
  label: string;
  percent: number;
  minimumMs: number;
  maximumMs: number;
  strokeMs: number;
}

export function StrokePowerSlider({
  label,
  percent,
  minimumMs,
  maximumMs,
  strokeMs,
  id,
  ...props
}: StrokePowerSliderProps) {
  const maxMs = Math.max(minimumMs, maximumMs);
  const minMs = Math.min(minimumMs, maximumMs);
  const inputId = id ?? `${label.toLowerCase().replace(/\s+/g, '-')}-power`;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
      <VerticalRangeControl
        id={inputId}
        label={label}
        value={percent}
        min={0}
        max={100}
        scaleTop={maxMs}
        scaleBottom={minMs}
        hideValueHeader
        tickDivisions={10}
        {...props}
      />

      <div className="space-y-3 text-center sm:text-left">
        <div>
          <p className="text-xs text-slate-400">Percent</p>
          <p className="text-base font-semibold text-white">{percent}%</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Milliseconds</p>
          <p className="text-base font-semibold text-white">{strokeMs}</p>
        </div>
      </div>
    </div>
  );
}
