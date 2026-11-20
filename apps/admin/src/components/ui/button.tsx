import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const STYLES: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-neutral-300',
  secondary:
    'border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 disabled:text-neutral-400',
  ghost: 'text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-400',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  busy?: boolean;
}

export function Button({
  variant = 'primary',
  busy = false,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled === true || busy}
      aria-busy={busy}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed ${STYLES[variant]} ${className}`}
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}
