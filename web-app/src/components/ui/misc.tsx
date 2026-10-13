'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn, humanize, initials } from '@/lib/utils';
import type { PageMeta } from '@/lib/api';

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ChevronLeft className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-8">{title}</h1>
          {subtitle && <div className="mt-1 text-ink-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Panel({ title, action, children, className, bodyClass }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn('panel', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={cn('p-5', bodyClass)}>{children}</div>
    </section>
  );
}

export function Empty({ title, body, icon, action }: { title: string; body?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-canvas p-3 text-ink-faint">{icon || <Inbox className="h-6 w-6" />}</div>
      <p className="font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="panel border-danger/30 bg-danger-soft/40 p-5">
      <p className="font-semibold text-danger">Couldn&apos;t load this</p>
      <p className="mt-1 text-sm text-ink-soft">{error instanceof Error ? error.message : 'Something went wrong'}</p>
      {retry && (
        <button onClick={retry} className="mt-3 text-sm font-semibold text-brand hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-line/70', className)} />;
}

export function Avatar({ name, className, tone = 'neutral' }: { name?: string; className?: string; tone?: 'neutral' | 'brand' }) {
  return (
    <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold', tone === 'brand' ? 'bg-brand-soft text-brand-dark' : 'bg-canvas text-ink-soft ring-1 ring-line', className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Pagination({ meta, onPage }: { meta?: PageMeta; onPage: (p: number) => void }) {
  if (!meta || meta.totalPages <= 1) return meta ? <p className="px-5 py-3 text-sm text-ink-muted">{meta.total} total</p> : null;
  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
      <span className="text-ink-muted">
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </span>
      <div className="flex gap-1">
        <button disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} className="rounded-lg p-1.5 hover:bg-canvas disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} className="rounded-lg p-1.5 hover:bg-canvas disabled:opacity-40" aria-label="Next page">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function KeyVal({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', cols === 3 ? 'sm:grid-cols-3' : cols === 2 ? 'sm:grid-cols-2' : '')}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-sm text-ink-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-[15px] text-ink">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {items.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn('-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[15px] font-medium transition-colors', value === t.value ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink')}
        >
          {t.label}
          {t.count !== undefined && <span className={cn('rounded-full px-2 text-xs font-semibold', value === t.value ? 'bg-brand text-white' : 'bg-canvas text-ink-muted ring-1 ring-line')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const Humanized = ({ v }: { v?: string }) => <>{humanize(v)}</>;
