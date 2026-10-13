'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { getPaged } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { dateOnly, inr, toQuery } from '@/lib/utils';
import type { User } from '@/lib/types';
import { DataTable, type Column } from '@/components/ui/table';
import { Avatar, Empty, ErrorState, PageHeader, Pagination } from '@/components/ui/misc';
import { Input, Select } from '@/components/ui/form';
import { Badge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { AddUserDialog, RowActions } from '@/components/people/admin-dialogs';

type Customer = User & { parentsCount: number; bookingsCount: number; lastBookingAt?: string; totalSpend: number };

export default function CustomersPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const search = useDebounced(q);
  const params = { q: search, status, page, limit: 25 };
  const list = useQuery({ queryKey: ['customers', params], queryFn: () => getPaged<Customer>(`/admin/customers${toQuery(params)}`), placeholderData: keepPreviousData });

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      cell: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.name} />
          <div className="min-w-0">
            <p className="font-medium">{c.name}</p>
            <p className="truncate text-sm text-ink-muted">{c.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'where', header: 'Lives in', hideBelow: 'md', cell: (c) => <span>{c.country || '—'} <span className="text-sm text-ink-muted">{c.timezone}</span></span> },
    { key: 'parents', header: 'Parents', cell: (c) => c.parentsCount },
    { key: 'visits', header: 'Visits', hideBelow: 'md', cell: (c) => <span>{c.bookingsCount}<span className="block text-sm text-ink-muted">{c.lastBookingAt ? `last ${dateOnly(c.lastBookingAt)}` : ''}</span></span> },
    { key: 'spend', header: 'Paid (net)', hideBelow: 'lg', cell: (c) => inr(c.totalSpend) },
    { key: 'status', header: 'Login', cell: (c) => <Badge tone={c.status === 'ACTIVE' ? 'ok' : 'danger'}>{c.status === 'ACTIVE' ? 'Login on' : 'Login off'}</Badge> },
    { key: 'act', header: '', cell: (c) => <RowActions href={`/customers/${c._id}`} name={c.name} userId={c._id} role="CUSTOMER" /> },
  ];

  return (
    <>
      <PageHeader title="Customers" subtitle="Families who book visits, mostly from abroad." actions={<Button onClick={() => setAdding(true)}>+ Add customer</Button>} />
      {adding && <AddUserDialog role="CUSTOMER" onClose={() => setAdding(false)} />}
      <div className="panel">
        <div className="grid gap-3 border-b border-line p-5 sm:grid-cols-[1fr_200px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
            <Input aria-label="Search customers" className="pl-9" placeholder="Name, email or mobile" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <Select aria-label="Account status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All accounts</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
        </div>
        {list.isError ? <div className="p-5"><ErrorState error={list.error} retry={() => list.refetch()} /></div> : (
          <DataTable columns={columns} rows={list.data?.items} loading={list.isLoading} onRowClick={(c) => router.push(`/customers/${c._id}`)} empty={<Empty title="No customers found" />} />
        )}
        <Pagination meta={list.data?.meta} onPage={setPage} />
      </div>
    </>
  );
}
