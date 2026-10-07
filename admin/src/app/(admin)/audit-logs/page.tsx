'use client';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getPaged } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { dateTime, humanize, toQuery } from '@/lib/utils';
import { DataTable, type Column } from '@/components/ui/table';
import { Empty, ErrorState, PageHeader, Pagination } from '@/components/ui/misc';
import { Input, Select } from '@/components/ui/form';
import { Badge } from '@/components/ui/status';
import { Dialog } from '@/components/ui/dialog';

type Log = { _id: string; action: string; entityType: string; entityId?: string; actorRole: string; actorId?: { name: string; email: string } | null; before?: unknown; after?: unknown; metadata?: unknown; ip?: string; userAgent?: string; requestId?: string; createdAt: string };
const ENTITIES = ['Booking', 'User', 'AssistantProfile', 'AssistantDocument', 'Parent', 'Payment', 'Refund', 'RecurringPlan', 'Service', 'HealthVisit', 'HealthReport', 'EmergencyAlert', 'Notification'];

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Log | null>(null);
  const a = useDebounced(action);
  const params = { action: a, entityType, actorRole, from, to, page, limit: 50 };
  const list = useQuery({ queryKey: ['audit', params], queryFn: () => getPaged<Log>(`/admin/audit-logs${toQuery(params)}`), placeholderData: keepPreviousData });
  const reset = () => setPage(1);

  const columns: Column<Log>[] = [
    { key: 'when', header: 'When (IST)', cell: (l) => <span className="whitespace-nowrap text-sm">{dateTime(l.createdAt)}</span> },
    { key: 'action', header: 'Action', cell: (l) => <span className="font-medium">{humanize(l.action)}</span> },
    { key: 'who', header: 'By', cell: (l) => <span>{l.actorId?.name || humanize(l.actorRole)} <Badge className="ml-1">{humanize(l.actorRole)}</Badge></span> },
    { key: 'what', header: 'Record', hideBelow: 'md', cell: (l) => <span className="text-sm">{l.entityType}<span className="block text-ink-faint">{l.entityId}</span></span> },
    { key: 'ip', header: 'IP', hideBelow: 'lg', cell: (l) => <span className="text-sm text-ink-muted">{l.ip || '—'}</span> },
  ];

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every admin action, status change, payment event and health-record edit. Read-only." />
      <div className="panel">
        <div className="grid gap-3 border-b border-line p-5 sm:grid-cols-2 lg:grid-cols-5">
          <Input aria-label="Action" placeholder="Action, e.g. ASSIGN" value={action} onChange={(e) => { setAction(e.target.value); reset(); }} />
          <Select aria-label="Record type" value={entityType} onChange={(e) => { setEntityType(e.target.value); reset(); }}>
            <option value="">Any record</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
          <Select aria-label="Actor role" value={actorRole} onChange={(e) => { setActorRole(e.target.value); reset(); }}>
            <option value="">Anyone</option>
            {['ADMIN', 'CUSTOMER', 'ASSISTANT', 'SYSTEM'].map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
          </Select>
          <Input aria-label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} />
          <Input aria-label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} />
        </div>
        {list.isError ? <div className="p-5"><ErrorState error={list.error} /></div> : <DataTable columns={columns} rows={list.data?.items} loading={list.isLoading} onRowClick={setOpen} empty={<Empty title="No entries match" />} />}
        <Pagination meta={list.data?.meta} onPage={setPage} />
      </div>
      {open && (
        <Dialog open onClose={() => setOpen(null)} wide title={humanize(open.action)} description={`${dateTime(open.createdAt)} · ${open.actorId?.name || humanize(open.actorRole)}${open.actorId?.email ? ` (${open.actorId.email})` : ''}`}>
          <div className="space-y-4 text-sm">
            <p><span className="text-ink-muted">Record:</span> {open.entityType} {open.entityId}</p>
            <p><span className="text-ink-muted">Request:</span> {open.requestId || '—'} · {open.ip || '—'}</p>
            {open.userAgent && <p className="break-words text-ink-muted">{open.userAgent}</p>}
            {(['before', 'after', 'metadata'] as const).map((k) =>
              open[k] ? (
                <div key={k}>
                  <p className="mb-1 font-semibold">{humanize(k)}</p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-canvas p-3 text-xs leading-5">{JSON.stringify(open[k], null, 2)}</pre>
                </div>
              ) : null
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
