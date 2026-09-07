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
  disabled,
  ...props
}: StrokePowerSliderProps) {
  const maxMs = Math.max(minimumMs, maximumMs);
  const minMs = Math.min(minimumMs, maximumMs);
  const inputId = id ?? `${label.toLowerCase().replace(/\s+/g, '-')}-power`;
  const isDisabled = Boolean(disabled);

  return (
    <div
      className={[
        'flex min-w-0 flex-col items-center gap-2',
        isDisabled ? 'opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-disabled={isDisabled}
    >
      <p
        className={[
          'w-full text-center text-sm font-medium',
          isDisabled ? 'text-slate-500' : 'text-slate-300',
        ].join(' ')}
      >
        {label}
      </p>

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
          disabled={disabled}
          {...props}
        />

        <div className="space-y-3 text-center sm:text-left">
          <div>
            <p className={isDisabled ? 'text-xs text-slate-600' : 'text-xs text-slate-400'}>
              Percent
            </p>
            <p
              className={
                isDisabled
                  ? 'text-base font-semibold text-slate-600'
                  : 'text-base font-semibold text-white'
              }
            >
              {percent}%
            </p>
          </div>
          <div>
            <p className={isDisabled ? 'text-xs text-slate-600' : 'text-xs text-slate-400'}>
              Milliseconds
            </p>
            <p
              className={
                isDisabled
                  ? 'text-base font-semibold text-slate-600'
                  : 'text-base font-semibold text-white'
              }
            >
              {strokeMs}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
