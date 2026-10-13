'use client';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark disabled:bg-brand/50',
  secondary: 'bg-white text-ink border border-line-strong hover:border-ink-faint hover:bg-canvas',
  ghost: 'text-ink-soft hover:bg-canvas hover:text-ink',
  danger: 'bg-white text-danger border border-danger/40 hover:bg-danger-soft',
  quiet: 'text-brand hover:bg-brand-soft',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-[15px] gap-2', lg: 'h-12 px-5 text-base gap-2', icon: 'h-9 w-9 justify-center' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={cn('inline-flex items-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap', variants[variant], sizes[size], className)}
    {...props}
  >
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = 'Button';
