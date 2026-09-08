import type { InputHTMLAttributes } from 'react';

interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  inline?: boolean;
  type?: 'number' | 'text';
  /** Reserve two lines of label height so stacked inputs align in a row. */
  alignLabelHeight?: boolean;
}

export function NumberField({
  label,
  inline = false,
  type = 'number',
  id,
  className = '',
  disabled,
  alignLabelHeight = false,
  ...props
}: NumberFieldProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  const isDisabled = Boolean(disabled);
  const labelClass = isDisabled ? 'text-slate-600' : 'text-slate-400';
  const inputClass = [
    inline
      ? 'w-16 rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-center text-sm'
      : 'w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm',
    isDisabled
      ? 'cursor-not-allowed text-slate-600 opacity-60'
      : 'text-white',
    'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (inline && label) {
    return (
      <div className={['flex items-center gap-2', isDisabled ? 'opacity-80' : ''].join(' ')}>
        <label htmlFor={inputId} className={['shrink-0 text-sm', labelClass].join(' ')}>
          {label}
        </label>
        <input id={inputId} type={type} className={inputClass} disabled={disabled} {...props} />
      </div>
    );
  }

  return (
    <div className={['space-y-1', isDisabled ? 'opacity-80' : ''].join(' ')}>
      {label ? (
        <label
          htmlFor={inputId}
          className={[
            'block text-sm leading-snug',
            alignLabelHeight ? 'min-h-10' : '',
            labelClass,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {label}
        </label>
      ) : null}
      <input id={inputId} type={type} className={inputClass} disabled={disabled} {...props} />
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
  minDisabled?: boolean;
  maxDisabled?: boolean;
  minLimit?: number;
  maxLimit?: number;
  /** Lower bound for the Min input (defaults to `minLimit`). */
  minValueMin?: number;
  /** Lower bound for the Max input (defaults to `minLimit`). */
  maxValueMin?: number;
}

export function MinMaxRow({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
  disabled = false,
  minDisabled = false,
  maxDisabled = false,
  minLimit = 0,
  maxLimit = 9999,
  minValueMin,
  maxValueMin,
}: MinMaxRowProps) {
  const minFieldDisabled = disabled || minDisabled;
  const maxFieldDisabled = disabled || maxDisabled;
  const minInputMin = minValueMin ?? minLimit;
  const maxInputMin = maxValueMin ?? minLimit;

  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <p className="mb-2 text-sm text-slate-400">{label}</p>
      <div className="flex flex-wrap items-center gap-4">
        <NumberField
          label="Min"
          inline
          value={min}
          min={minInputMin}
          max={maxLimit}
          disabled={minFieldDisabled}
          onChange={(event) => onMinChange(Number(event.target.value))}
        />
        <NumberField
          label="Max"
          inline
          value={max}
          min={maxInputMin}
          max={maxLimit}
          disabled={maxFieldDisabled}
          onChange={(event) => onMaxChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
