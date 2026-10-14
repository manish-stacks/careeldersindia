'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock } from 'lucide-react';
import { get } from '@/lib/api';

export type PublicService = {
  _id: string; name: string; description?: string; durationMinutes: number;
  sheetKind?: 'NONE' | 'CHECKLIST' | 'TABLE'; items?: { key: string; label: string }[];
};

export const useServices = () => useQuery({ queryKey: ['public-services'], queryFn: () => get<PublicService[]>('/services'), staleTime: 300_000, retry: 1 });

const FALLBACK = 'A home visit by a trained assistant, with a written report for you.';
const BOOK = '/customer/login?next=/customer/book';
const box = 'rounded-md border border-rule bg-white';

/** full = every service with all of its tests (services page); otherwise compact cards (home page). */
export function ServiceGrid({ limit, full }: { limit?: number; full?: boolean }) {
  const { data, isLoading, isError, refetch } = useServices();
  if (isLoading) return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className={`h-72 animate-pulse ${box} bg-sand`} />)}</div>;
  if (isError) return <div className={`${box} p-10 text-center`}><p className="text-lg font-semibold">We could not load our services right now.</p><button onClick={() => refetch()} className="mt-3 text-lg font-semibold text-navy underline">Try again</button></div>;
  if (!data?.length) return <div className={`${box} p-10 text-center text-ink-muted`}>Our services will be listed here shortly. Please <Link href="/contact" className="font-semibold text-navy underline">contact us</Link> for details.</div>;
  const list = data.slice(0, limit || data.length);

  if (full) {
    return (
      <div className="divide-y divide-rule border-y border-rule">
        {list.map((s) => (
          <article key={s._id} className="grid gap-8 py-10 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <h2 className="display text-2xl leading-snug text-navy sm:text-3xl">{s.name}</h2>
              <p className="mt-3 text-ink-soft">{s.description || FALLBACK}</p>
              <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-ink-muted"><Clock className="h-4 w-4" aria-hidden />About {s.durationMinutes} minutes</p>
              <br /><Link href={BOOK} className="btn-solid mt-5 flex">Book this visit</Link>
            </div>
            <div>
              <h3 className="display text-lg italic text-leaf">What the assistant checks{!!s.items?.length && ` (${s.items.length})`}</h3>
              {s.items?.length ? (
                <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {s.items.map((it) => <li key={it.key} className="flex items-start gap-3"><Check className="mt-1 h-5 w-5 shrink-0 text-leaf" aria-hidden />{it.label}</li>)}
                </ul>
              ) : <p className="mt-4 text-ink-muted">Vitals, symptoms and notes recorded by a trained assistant and shared in your report.</p>}
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((s) => (
        <article key={s._id} className={`${box} flex flex-col p-6`}>
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted"><Clock className="h-4 w-4" aria-hidden />About {s.durationMinutes} minutes</p>
          <h3 className="display mt-2 text-xl leading-snug text-navy">{s.name}</h3>
          <p className="mt-2 line-clamp-3 text-ink-muted">{s.description || FALLBACK}</p>
          {!!s.items?.length && (
            <p className="mt-4 flex-1 text-sm text-ink-soft">{s.items.slice(0, 5).map((it) => it.label).join(' · ')}{s.items.length > 5 && ` · +${s.items.length - 5} more`}</p>
          )}
          <Link href={BOOK} className="btn-solid mt-6">Book this visit</Link>
        </article>
      ))}
    </div>
  );
}
