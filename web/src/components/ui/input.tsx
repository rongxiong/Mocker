import { forwardRef } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-lg border border-white/[0.08] bg-ink-900/70 px-2.5 text-[12.5px] text-muted-100',
        'placeholder:text-muted-300/70 transition-colors focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-lg border border-white/[0.08] bg-ink-900/70 px-2.5 py-2 text-[12.5px] text-muted-100',
      'placeholder:text-muted-300/70 transition-colors focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'select-chevron h-8 cursor-pointer appearance-none rounded-lg border border-white/[0.08] bg-ink-900/70 pl-2.5 pr-7 text-[12.5px] text-muted-100',
        'transition-colors focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40',
        '[&>option]:bg-ink-800 [&>option]:text-muted-100',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('field-label', className)} {...props} />;
}
