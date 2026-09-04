import type { InputHTMLAttributes } from 'react';

interface RadioGroupProps {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function RadioGroup({ name, value, options, onChange, disabled = false }: RadioGroupProps) {
  return (
    <div className={`flex flex-col gap-2 ${disabled ? 'opacity-50' : ''}`}>
      {options.map((option) => (
        <label
          key={option.value}
          className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            className="h-4 w-4 border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/50"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

interface SelectFieldProps extends InputHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
}

export function SelectField({ label, options, id, className = '', ...props }: SelectFieldProps) {
  const selectId = id ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      <label htmlFor={selectId} className="block text-sm text-slate-400">
        {label}
      </label>
      <select
        id={selectId}
        className={[
          'w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
