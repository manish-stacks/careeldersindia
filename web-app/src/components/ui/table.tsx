'use client';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from './misc';

export type Column<T> = { key: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string; hideBelow?: 'md' | 'lg' };

export function DataTable<T extends { _id?: string }>({ columns, rows, loading, onRowClick, empty, rowKey }: { columns: Column<T>[]; rows?: T[]; loading?: boolean; onRowClick?: (row: T) => void; empty?: ReactNode; rowKey?: (r: T) => string }) {
  const hide = (c: Column<T>) => (c.hideBelow === 'lg' ? 'hidden lg:table-cell' : c.hideBelow === 'md' ? 'hidden md:table-cell' : '');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[15px]">
        <thead>
          <tr className="border-b border-line text-sm text-ink-muted">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('px-5 py-2.5 font-medium', hide(c), c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-5 py-3.5', hide(c))}>
                    <Skeleton className="h-4 w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            rows?.map((r, i) => (
              <tr
                key={rowKey ? rowKey(r) : r._id || i}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn('border-b border-line align-top last:border-0', onRowClick && 'cursor-pointer hover:bg-canvas/70 focus-visible:bg-canvas')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-5 py-3.5', hide(c), c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!loading && rows && rows.length === 0 && empty}
    </div>
  );
}
