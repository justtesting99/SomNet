import type { InputHTMLAttributes } from 'react';

interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  inline?: boolean;
}

export function NumberField({
  label,
  inline = false,
  id,
  className = '',
  ...props
}: NumberFieldProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  if (inline && label) {
    return (
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="shrink-0 text-sm text-slate-400">
          {label}
        </label>
        <input
          id={inputId}
          type="number"
          className={[
            'w-16 rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-center text-sm text-white',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {label ? (
        <label htmlFor={inputId} className="block text-sm text-slate-400">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        type="number"
        className={[
          'w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    </div>
  );
}

interface MinMaxRowProps {
  label: string;
  min: number;
  max: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
  disabled?: boolean;
  minLimit?: number;
  maxLimit?: number;
}

export function MinMaxRow({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
  disabled = false,
  minLimit = 0,
  maxLimit = 9999,
}: MinMaxRowProps) {
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <p className="mb-2 text-sm text-slate-400">{label}</p>
      <div className="flex flex-wrap items-center gap-4">
        <NumberField
          label="Min"
          inline
          value={min}
          min={minLimit}
          max={maxLimit}
          disabled={disabled}
          onChange={(event) => onMinChange(Number(event.target.value))}
        />
        <NumberField
          label="Max"
          inline
          value={max}
          min={minLimit}
          max={maxLimit}
          disabled={disabled}
          onChange={(event) => onMaxChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
