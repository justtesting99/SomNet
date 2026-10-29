import type { InputHTMLAttributes } from 'react';
import { VerticalRangeControl } from '@/components/ui/VerticalRangeControl';

interface MotorSpeedSliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> {
  label: string;
  percent: number;
  minimumDuty: number;
  maximumDuty: number;
  dutyPercent: number;
}

/** Vertical speed slider — layout matches {@link StrokePowerSlider} (relay Power). */
export function MotorSpeedSlider({
  label,
  percent,
  minimumDuty,
  maximumDuty,
  dutyPercent,
  id,
  disabled,
  ...props
}: MotorSpeedSliderProps) {
  const maxDuty = Math.max(minimumDuty, maximumDuty);
  const minDuty = Math.min(minimumDuty, maximumDuty);
  const inputId = id ?? `${label.toLowerCase().replace(/\s+/g, '-')}-speed`;
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
          scaleTop={maxDuty}
          scaleBottom={minDuty}
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
              Duty
            </p>
            <p
              className={
                isDisabled
                  ? 'text-base font-semibold text-slate-600'
                  : 'text-base font-semibold text-white'
              }
            >
              {dutyPercent}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
