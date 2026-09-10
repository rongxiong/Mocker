import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[12.5px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:pointer-events-none disabled:opacity-45 active:scale-[.97]',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-gradient text-ink-900 shadow-[0_8px_24px_-10px_rgba(124,92,255,.9)] hover:brightness-110',
        secondary:
          'border border-white/10 bg-white/[0.05] text-muted-100 hover:border-white/20 hover:bg-white/[0.09]',
        ghost: 'text-muted-200 hover:bg-white/[0.07] hover:text-muted-100',
        outline:
          'border border-brand-500/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20 hover:text-white',
        danger:
          'border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:border-rose-500/50 hover:bg-rose-500/20',
      },
      size: {
        sm: 'h-7 px-2.5',
        md: 'h-8 px-3',
        lg: 'h-9 px-4 text-[13px]',
        icon: 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
