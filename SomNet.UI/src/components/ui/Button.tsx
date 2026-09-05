import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  pending?: boolean;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-400 shadow-sm shadow-indigo-900/20',
  secondary:
    'bg-slate-700 text-slate-100 hover:bg-slate-600 focus-visible:ring-slate-400 border border-slate-600',
  ghost:
    'bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:ring-slate-500',
  danger:
    'bg-red-600/90 text-white hover:bg-red-500 focus-visible:ring-red-400',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  pending = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[transform,colors,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
        'disabled:pointer-events-none disabled:opacity-50',
        'active:scale-[0.97] active:brightness-95',
        variantClasses[variant],
        sizeClasses[size],
        pending
          ? 'scale-[0.98] cursor-wait ring-2 ring-amber-400/90 ring-offset-2 ring-offset-slate-900 brightness-110 shadow-lg shadow-amber-900/20'
          : '',
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {pending ? (
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
}
