import { forwardRef } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full min-w-0 rounded-lg border border-line bg-ink-800 px-3 text-[14px] text-muted-100',
        'placeholder:text-muted-300 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40',
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
      'w-full min-w-0 rounded-lg border border-line bg-ink-800 px-3 py-2 text-[14px] text-muted-100',
      'placeholder:text-muted-300 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40',
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
        'select-chevron h-9 min-w-0 cursor-pointer appearance-none rounded-lg border border-line bg-ink-800 pl-3 pr-8 text-[14px] text-muted-100',
        'transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40',
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

export function Label({
  className,
  title,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('field-label truncate', className)}
      title={title ?? (typeof children === 'string' ? children : undefined)}
      {...props}
    >
      {children}
    </label>
  );
}
