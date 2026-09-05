import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <fieldset
      className={[
        'rounded-xl border border-slate-700/90 bg-slate-900/50 p-4 sm:p-5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <legend className="px-2 text-sm font-semibold text-slate-200">{title}</legend>
      <div className="flex min-w-0 flex-col">{children}</div>
    </fieldset>
  );
}
