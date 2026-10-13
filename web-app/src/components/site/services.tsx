'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock, ClipboardList, Droplets, Stethoscope } from 'lucide-react';
import { get } from '@/lib/api';

export type PublicService = {
  _id: string; name: string; description?: string; durationMinutes: number;
  sheetKind?: 'NONE' | 'CHECKLIST' | 'TABLE'; items?: { key: string; label: string }[];
};

export const useServices = () => useQuery({ queryKey: ['public-services'], queryFn: () => get<PublicService[]>('/services'), staleTime: 300_000, retry: 1 });

const FALLBACK = 'A home visit by a trained assistant, with a written report for you.';
const BOOK = '/customer/login?next=/customer/book';
const box = 'rounded-3xl border border-[#D6E8E6] bg-white';

function Icon({ kind, className }: { kind?: string; className?: string }) {
  const I = kind === 'CHECKLIST' ? ClipboardList : kind === 'TABLE' ? Droplets : Stethoscope;
  return <I className={className} aria-hidden />;
}

/** full = every service with all of its tests (services page); otherwise compact cards (home page). */
export function ServiceGrid({ limit, full }: { limit?: number; full?: boolean }) {
  const { data, isLoading, isError, refetch } = useServices();
  if (isLoading) return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className={`h-72 animate-pulse ${box} bg-white/60`} />)}</div>;
  if (isError) return <div className={`${box} p-10 text-center`}><p className="text-lg font-semibold">We could not load our services right now.</p><button onClick={() => refetch()} className="mt-3 text-lg font-semibold text-brand hover:underline">Try again</button></div>;
  if (!data?.length) return <div className={`${box} p-10 text-center text-ink-muted`}>Our services will be listed here shortly. Please <Link href="/contact" className="font-semibold text-brand hover:underline">contact us</Link> for details.</div>;
  const list = data.slice(0, limit || data.length);

  if (full) {
    return (
      <div className="space-y-8">
        {list.map((s) => (
          <article key={s._id} className={`${box} grid gap-8 p-6 shadow-sm sm:p-10 lg:grid-cols-[1fr_1.6fr]`}>
            <div>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Icon kind={s.sheetKind} className="h-7 w-7" /></span>
              <h2 className="display mt-5 text-2xl font-bold leading-snug text-[#0B3A53] sm:text-3xl">{s.name}</h2>
              <p className="mt-3 leading-relaxed text-ink-soft">{s.description || FALLBACK}</p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#F3FAF9] px-4 py-1.5 text-sm font-medium text-ink-soft"><Clock className="h-4 w-4" aria-hidden />About {s.durationMinutes} minutes</p>
              <Link href={BOOK} className="mt-6 block rounded-full bg-brand px-6 py-3.5 text-center text-lg font-semibold text-white hover:bg-brand-dark">Book this visit</Link>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0B3A53]">Tests and checks included{!!s.items?.length && <span className="ml-2 rounded-full bg-brand-soft px-3 py-0.5 text-sm font-semibold text-brand">{s.items.length}</span>}</h3>
              {s.items?.length ? (
                <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {s.items.map((it) => <li key={it.key} className="flex items-start gap-3"><Check className="mt-1 h-5 w-5 shrink-0 text-[#1B7A44]" aria-hidden />{it.label}</li>)}
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
        <article key={s._id} className={`${box} flex flex-col overflow-hidden transition-shadow hover:shadow-lg`}>
          <div className="flex items-center gap-3 bg-brand-soft px-6 py-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand"><Icon kind={s.sheetKind} className="h-6 w-6" /></span>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft"><Clock className="h-4 w-4" aria-hidden />About {s.durationMinutes} minutes</span>
          </div>
          <div className="flex flex-1 flex-col p-6">
            <h3 className="display text-xl font-bold leading-snug text-[#0B3A53]">{s.name}</h3>
            <p className="mt-2 line-clamp-3 leading-relaxed text-ink-muted">{s.description || FALLBACK}</p>
            {!!s.items?.length && (
              <div className="mt-4 flex flex-1 flex-wrap content-start gap-2">
                {s.items.slice(0, 5).map((it) => <span key={it.key} className="rounded-full bg-[#F3FAF9] px-3 py-1 text-sm text-ink-soft">{it.label}</span>)}
                {s.items.length > 5 && <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">+{s.items.length - 5} more</span>}
              </div>
            )}
            <Link href={BOOK} className="mt-6 rounded-full bg-brand px-4 py-3.5 text-center text-lg font-semibold text-white hover:bg-brand-dark">Book this visit</Link>
          </div>
        </article>
      ))}
    </div>
  );
}
