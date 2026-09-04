import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, id, className = '', ...props }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-300">
        {label}
      </label>
      <input
        id={inputId}
        className={[
          'w-full rounded-xl border bg-slate-900/60 px-4 py-2.5 text-sm text-white placeholder:text-slate-500',
          'transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50',
          error ? 'border-red-500/70' : 'border-slate-700 hover:border-slate-600',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
