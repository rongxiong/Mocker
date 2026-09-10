import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({ checked, onCheckedChange, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200',
        checked
          ? 'border-brand-400/60 bg-brand-500/80 shadow-[0_0_12px_-2px_rgba(124,92,255,.9)]'
          : 'border-white/10 bg-white/[0.08]',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none block h-[12px] w-[12px] rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-[16px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}
