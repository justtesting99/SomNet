import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, description, children, className = '' }: CardProps) {
  return (
    <section
      className={[
        'rounded-2xl border border-slate-800/80 bg-slate-900/70 p-5 shadow-xl shadow-black/20 backdrop-blur-sm',
        'sm:p-6',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(title || description) && (
        <header className="mb-5 shrink-0 space-y-1">
          {title ? <h2 className="text-lg font-semibold text-white">{title}</h2> : null}
          {description ? <p className="text-sm text-slate-400">{description}</p> : null}
        </header>
      )}
      {children}
    </section>
  );
}
