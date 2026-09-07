import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <section
      className={[
        'min-w-0 overflow-hidden rounded-xl border border-slate-700/90 bg-slate-900/50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="border-b border-slate-800 px-3 py-2">
        <h2 className="text-sm font-semibold leading-none text-slate-200">{title}</h2>
      </header>
      <div className="flex min-w-0 flex-col p-4 sm:p-5">{children}</div>
    </section>
  );
}
