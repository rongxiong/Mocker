import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-line bg-fill px-1.5 py-0.5 text-[12px] text-muted-200',
        className,
      )}
      {...props}
    />
  );
}

const METHOD_DOT: Record<string, string> = {
  GET: 'bg-emerald-400',
  POST: 'bg-sky-400',
  PUT: 'bg-amber-400',
  PATCH: 'bg-violet-400',
  DELETE: 'bg-rose-400',
  HEAD: 'bg-slate-400',
  OPTIONS: 'bg-teal-400',
};

export function MethodBadge({ method, className }: { method: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[64px] shrink-0 items-center justify-center gap-1.5 rounded-md border border-line bg-fill px-1 py-0.5 font-mono text-[12px] text-muted-100',
        className,
      )}
    >
      <span className={cn('h-1 w-1 shrink-0 rounded-full', METHOD_DOT[method] ?? 'bg-muted-300')} />
      {method}
    </span>
  );
}
