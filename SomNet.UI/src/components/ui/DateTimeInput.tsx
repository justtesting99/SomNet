import type { InputHTMLAttributes } from 'react';
import { normalizeDateTimeLocal } from '@/utils/dateTimeLocal';

interface DateTimeInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  hint?: string;
}

export function DateTimeInput({
  label,
  value,
  onValueChange,
  hint,
  id,
  className = '',
  ...props
}: DateTimeInputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');

  function syncValue(nextValue: string) {
    const normalized = normalizeDateTimeLocal(nextValue);
    if (normalized !== value) {
      onValueChange(normalized);
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-300">
        {label}
      </label>
      <input
        id={inputId}
        type="datetime-local"
        step={60}
        value={value}
        className={[
          'w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm text-white',
          'transition-colors hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50',
          '[color-scheme:dark]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        onChange={(event) => syncValue(event.currentTarget.value)}
        onInput={(event) => syncValue(event.currentTarget.value)}
        onBlur={(event) => syncValue(event.currentTarget.value)}
        {...props}
      />
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
