import type { InputHTMLAttributes } from 'react';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  valueLabel?: string;
  hint?: string;
}

export function Slider({ label, valueLabel, hint, id, className = '', ...props }: SliderProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-300">
          {label}
        </label>
        {valueLabel ? (
          <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-indigo-300">
            {valueLabel}
          </span>
        ) : null}
      </div>
      <input
        id={inputId}
        type="range"
        className={[
          'h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700',
          'accent-indigo-500',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
