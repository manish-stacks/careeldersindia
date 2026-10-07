'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { getPaged } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { dateOnly, humanize, toQuery } from '@/lib/utils';
import { DataTable, type Column } from '@/components/ui/table';
import { Empty, ErrorState, PageHeader, Pagination } from '@/components/ui/misc';
import { Input, Select } from '@/components/ui/form';
import { OverallBadge } from '@/components/ui/status';

type Row = { _id: string; fullName: string; age?: number; gender: string; address: { city: string; pincode: string }; medicalConditions: string[]; lastVisitAt?: string; lastOverallStatus?: never; ownerId?: { name: string; email: string } };

export default function ParentsPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [overall, setOverall] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  const params = { q: search, overallStatus: overall, page, limit: 25 };
  const list = useQuery({ queryKey: ['parents', params], queryFn: () => getPaged<Row>(`/admin/parents${toQuery(params)}`), placeholderData: keepPreviousData });

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Parent', cell: (p) => <div><p className="font-medium">{p.fullName}</p><p className="text-sm text-ink-muted">{p.age} yrs · {humanize(p.gender)}</p></div> },
    { key: 'where', header: 'Area', cell: (p) => <span>{p.address.city}<span className="block text-sm text-ink-muted">{p.address.pincode}</span></span> },
    { key: 'cond', header: 'Conditions (family-reported)', hideBelow: 'lg', cell: (p) => <span className="line-clamp-2 text-sm">{p.medicalConditions?.join(', ') || '—'}</span> },
    { key: 'family', header: 'Family', hideBelow: 'md', cell: (p) => p.ownerId?.name || '—' },
    { key: 'last', header: 'Last visit', cell: (p) => <div className="space-y-1"><OverallBadge status={p.lastOverallStatus} /><p className="text-sm text-ink-muted">{p.lastVisitAt ? dateOnly(p.lastVisitAt) : 'Never visited'}</p></div> },
  ];

  return (
    <>
      <PageHeader title="Parents" subtitle="The people we visit. Status shows what the last assistant recorded." />
      <div className="panel">
        <div className="grid gap-3 border-b border-line p-5 sm:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
            <Input aria-label="Search parents" className="pl-9" placeholder="Name, mobile, city or PIN" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <Select aria-label="Last recorded status" value={overall} onChange={(e) => { setOverall(e.target.value); setPage(1); }}>
            <option value="">Any last status</option>
            <option value="URGENT_ATTENTION">Urgent attention</option>
            <option value="NEEDS_ATTENTION">Needs attention</option>
            <option value="STABLE">Stable</option>
          </Select>
        </div>
        {list.isError ? <div className="p-5"><ErrorState error={list.error} /></div> : <DataTable columns={columns} rows={list.data?.items} loading={list.isLoading} onRowClick={(p) => router.push(`/parents/${p._id}`)} empty={<Empty title="No parents found" />} />}
        <Pagination meta={list.data?.meta} onPage={setPage} />
      </div>
    </>
  );
}
