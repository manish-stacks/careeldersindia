'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; title: string; body?: string; tone: Tone };
const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), t.tone === 'error' ? 7000 : 4500);
  }, []);
  const Icon = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.tone];
          return (
            <div key={t.id} className={cn('pointer-events-auto flex gap-3 rounded-xl border bg-white p-3.5 shadow-pop', t.tone === 'error' ? 'border-danger/30' : t.tone === 'success' ? 'border-ok/30' : 'border-line')}>
              <I className={cn('mt-0.5 h-5 w-5 shrink-0', t.tone === 'error' ? 'text-danger' : t.tone === 'success' ? 'text-ok' : 'text-info')} />
              <div className="min-w-0">
                <p className="font-semibold leading-5">{t.title}</p>
                {t.body && <p className="mt-0.5 text-sm text-ink-muted">{t.body}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => {
  const push = useContext(Ctx);
  return {
    success: (title: string, body?: string) => push({ title, body, tone: 'success' }),
    error: (title: string, body?: string) => push({ title, body, tone: 'error' }),
    info: (title: string, body?: string) => push({ title, body, tone: 'info' }),
  };
};
