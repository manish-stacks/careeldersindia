'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from './form';
import { Pagination } from './misc';

/** Search + pagination for lists the server returns in full (services, staff, templates). */
export function useClientList<T>(items: T[] | undefined, text: (t: T) => string, pageSize = 12) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items || []).filter((t) => !needle || text(t).toLowerCase().includes(needle));
  }, [items, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safe = Math.min(page, totalPages);
  return {
    q, setQ: (v: string) => { setQ(v); setPage(1); }, page: safe, setPage,
    rows: filtered.slice((safe - 1) * pageSize, safe * pageSize),
    meta: { page: safe, limit: pageSize, total: filtered.length, totalPages },
  };
}

export function SearchBar({ value, onChange, placeholder, children }: { value: string; onChange: (v: string) => void; placeholder: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative min-w-[240px] flex-1 sm:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
        <Input aria-label={placeholder} className="pl-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      {children}
    </div>
  );
}

export const ListPager = Pagination;
