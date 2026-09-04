import type { InputHTMLAttributes } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function Checkbox({ label, id, className = '', ...props }: CheckboxProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <label
      htmlFor={inputId}
      className={[
        'inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300',
        props.disabled ? 'cursor-not-allowed opacity-50' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        id={inputId}
        type="checkbox"
        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/50"
        {...props}
      />
      {label}
    </label>
  );
}
