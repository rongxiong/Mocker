import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'info' | 'warn';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];
let seed = 0;

function emit(): void {
  for (const listener of listeners) listener([...items]);
}

export function toast(message: string, tone: ToastTone = 'success'): void {
  seed += 1;
  const item = { id: seed, message, tone };
  items = [...items, item];
  emit();
  setTimeout(() => {
    items = items.filter((entry) => entry.id !== item.id);
    emit();
  }, 2600);
}

const ICONS: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warn: AlertTriangle,
};

const TONES: Record<ToastTone, string> = {
  success: 'border-emerald-400/30 text-emerald-300',
  error: 'border-rose-400/30 text-rose-300',
  info: 'border-sky-400/30 text-sky-300',
  warn: 'border-amber-400/30 text-amber-300',
};

export function ToastHost() {
  const [state, setState] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  if (state.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[300px] flex-col gap-2">
      {state.map((item) => {
        const Icon = ICONS[item.tone];
        return (
          <div
            key={item.id}
            className={cn(
              'glass-strong pointer-events-auto flex animate-slide-up items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] text-muted-100',
              TONES[item.tone],
            )}
          >
            <Icon size={15} className="mt-[1px] shrink-0" />
            <span className="leading-relaxed">{item.message}</span>
          </div>
        );
      })}
    </div>
  );
}
