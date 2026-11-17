import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[14px] font-medium transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-brand-500 text-on-brand hover:bg-brand-600',
        secondary: 'border border-line bg-fill text-muted-100 hover:bg-fill-strong',
        ghost: 'text-muted-200 hover:bg-fill hover:text-muted-100',
        outline: 'border border-brand-500/40 text-brand-200 hover:bg-fill',
        danger: 'border border-line text-danger hover:bg-danger/10',
      },
      size: {
        sm: 'h-8 px-2',
        md: 'h-9 px-3',
        lg: 'h-10 px-4',
        icon: 'h-8 w-8',
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
