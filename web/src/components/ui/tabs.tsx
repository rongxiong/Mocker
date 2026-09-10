import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ value: T; label: ReactNode; hint?: string }>;
  className?: string;
}

export function Tabs<T extends string>({ value, onChange, items, className }: TabsProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-white/[0.07] bg-ink-900/60 p-1',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            title={item.hint}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-200',
              active
                ? 'bg-brand-500/20 text-white shadow-[inset_0_0_0_1px_rgba(124,92,255,.45)]'
                : 'text-muted-200 hover:bg-white/[0.06] hover:text-muted-100',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
