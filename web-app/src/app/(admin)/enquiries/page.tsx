'use client';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Mail, Phone } from 'lucide-react';
import { getPaged, patch } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useDebounced } from '@/lib/hooks';
import { dateTime, toQuery } from '@/lib/utils';
import { DataTable, type Column } from '@/components/ui/table';
import { Empty, ErrorState, PageHeader, Pagination, Tabs } from '@/components/ui/misc';
import { Input } from '@/components/ui/form';
import { Badge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

type Enquiry = { _id: string; name: string; email: string; phone?: string; message: string; handled?: boolean; createdAt: string };
type Filter = 'open' | 'handled' | 'all';

export default function EnquiriesPage() {
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Enquiry | null>(null);
  const q = useDebounced(search);
  const params = { q, status: filter === 'all' ? '' : filter, page, limit: 20 };
  const list = useQuery({ queryKey: ['enquiries', params], queryFn: () => getPaged<Enquiry>(`/admin/enquiries${toQuery(params)}`), placeholderData: keepPreviousData });
  const mark = useAction(({ id, handled }: { id: string; handled: boolean }) => patch(`/admin/enquiries/${id}`, { handled }), {
    success: 'Enquiry updated',
    invalidate: [['enquiries']],
    onDone: () => setOpen(null),
  });

  const columns: Column<Enquiry>[] = [
    { key: 'when', header: 'Received', cell: (e) => <span className="whitespace-nowrap text-sm">{dateTime(e.createdAt)}</span> },
    { key: 'name', header: 'Name', cell: (e) => <span className="font-medium">{e.name}<span className="block text-sm font-normal text-ink-muted">{e.email}</span></span> },
    { key: 'phone', header: 'Phone', hideBelow: 'md', cell: (e) => <span className="text-sm">{e.phone || '—'}</span> },
    { key: 'msg', header: 'Message', hideBelow: 'lg', cell: (e) => <span className="line-clamp-1 max-w-sm text-sm text-ink-soft">{e.message}</span> },
    { key: 'status', header: 'Status', cell: (e) => <Badge tone={e.handled ? 'ok' : 'warn'}>{e.handled ? 'Handled' : 'New'}</Badge> },
  ];

  return (
    <>
      <PageHeader title="Enquiries" subtitle="Messages sent from the Contact page of the website." />
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <Tabs<Filter> value={filter} onChange={(v) => { setFilter(v); setPage(1); }} items={[{ value: 'open', label: 'New' }, { value: 'handled', label: 'Handled' }, { value: 'all', label: 'All' }]} />
          <Input aria-label="Search enquiries" placeholder="Search name, email or message" className="max-w-xs" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {list.isError ? <div className="p-5"><ErrorState error={list.error} retry={() => list.refetch()} /></div> : <DataTable columns={columns} rows={list.data?.items} loading={list.isLoading} onRowClick={setOpen} empty={<Empty title="No enquiries here" body="Messages from the website contact form will appear in this list." />} />}
        <Pagination meta={list.data?.meta} onPage={setPage} />
      </div>
      {open && (
        <Dialog open onClose={() => setOpen(null)} title={open.name} description={`Received ${dateTime(open.createdAt)}`}
          footer={<Button loading={mark.isPending} variant={open.handled ? 'secondary' : 'primary'} onClick={() => mark.mutate({ id: open._id, handled: !open.handled })}>{open.handled ? 'Mark as new' : 'Mark as handled'}</Button>}>
          <div className="space-y-4 text-[15px]">
            <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-ink-muted" aria-hidden /><a className="link" href={`mailto:${open.email}`}>{open.email}</a></p>
            {open.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-ink-muted" aria-hidden /><a className="link" href={`tel:${open.phone.replace(/\s/g, '')}`}>{open.phone}</a></p>}
            <p className="whitespace-pre-line rounded-lg bg-canvas p-4 text-ink-soft">{open.message}</p>
          </div>
        </Dialog>
      )}
    </>
  );
}
