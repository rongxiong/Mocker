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
        'inline-flex flex-wrap items-center gap-1 rounded-lg border border-line bg-fill p-1',
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
              'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150',
              active
                ? 'bg-ink-800 text-fg shadow-panel'
                : 'text-muted-200 hover:bg-fill-strong hover:text-muted-100',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
