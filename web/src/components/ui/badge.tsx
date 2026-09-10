import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
        'border-white/10 bg-white/[0.06] text-muted-200',
        className,
      )}
      {...props}
    />
  );
}

export function MethodBadge({ method, className }: { method: string; className?: string }) {
  const tones: Record<string, string> = {
    GET: 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300',
    POST: 'border-sky-400/30 bg-sky-400/15 text-sky-300',
    PUT: 'border-amber-400/30 bg-amber-400/15 text-amber-300',
    PATCH: 'border-violet-400/30 bg-violet-400/15 text-violet-300',
    DELETE: 'border-rose-400/30 bg-rose-400/15 text-rose-300',
    HEAD: 'border-slate-400/30 bg-slate-400/15 text-slate-300',
    OPTIONS: 'border-teal-400/30 bg-teal-400/15 text-teal-300',
  };
  return (
    <span
      className={cn(
        'inline-flex w-[54px] shrink-0 justify-center rounded-md border px-1 py-[1px] font-mono text-[10px] font-bold tracking-wider',
        tones[method] ?? 'border-white/10 bg-white/10 text-muted-200',
        className,
      )}
    >
      {method}
    </span>
  );
}
