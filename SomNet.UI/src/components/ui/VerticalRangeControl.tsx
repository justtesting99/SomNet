import type { InputHTMLAttributes } from 'react';

interface VerticalRangeControlProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  value: number;
  scaleTop?: number | string;
  scaleBottom?: number | string;
  hideValueHeader?: boolean;
}

export function VerticalRangeControl({
  label,
  value,
  scaleTop,
  scaleBottom,
  hideValueHeader = false,
  id,
  className = '',
  ...props
}: VerticalRangeControlProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');
  const showScale = scaleTop !== undefined || scaleBottom !== undefined;

  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      {!hideValueHeader ? (
        <p className="text-center text-sm font-medium text-slate-300">
          {label}: <span className="font-bold text-white">{value}</span>
        </p>
      ) : null}

      <div className="flex h-48 items-stretch gap-3 sm:h-56">
        <div className="flex w-8 shrink-0 flex-col justify-between py-1 text-xs text-slate-500">
          <span>100%</span>
          <span>0%</span>
        </div>

        <div className="flex w-10 shrink-0 items-center justify-center overflow-hidden">
          <input
            id={inputId}
            type="range"
            value={value}
            className={[
              'vertical-slider h-8 w-36 cursor-pointer appearance-none rounded-full bg-slate-700 accent-indigo-500 sm:w-40',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            {...props}
          />
        </div>

        {showScale ? (
          <div className="flex w-8 shrink-0 flex-col justify-between py-1 text-xs text-slate-500">
            <span>{scaleTop ?? ''}</span>
            <span>{scaleBottom ?? ''}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
