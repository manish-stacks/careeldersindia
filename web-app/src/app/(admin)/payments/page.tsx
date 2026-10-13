'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { get, getPaged, post } from '@/lib/api';
import { useAction, useDebounced } from '@/lib/hooks';
import { Search } from 'lucide-react';
import { dateTime, humanize, inr, toQuery } from '@/lib/utils';
import type { Payment } from '@/lib/types';
import { DataTable, type Column } from '@/components/ui/table';
import { Empty, ErrorState, KeyVal, PageHeader, Pagination, Skeleton, Tabs } from '@/components/ui/misc';
import { Badge, PaymentBadge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { PAY_METHODS } from '@/components/plans/shared';

function Inner() {
  const sp = useSearchParams();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(sp.get('focus'));
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const search = useDebounced(q);
  const customerId = sp.get('customerId') || undefined;
  const params = { customerId, status: status === 'all' ? undefined : status, q: search, method, from, to, page, limit: 25 };
  const list = useQuery({ queryKey: ['payments', params], queryFn: () => getPaged<Payment>(`/admin/payments${toQuery(params)}`), placeholderData: keepPreviousData });

  const columns: Column<Payment>[] = [
    { key: 'amt', header: 'Amount', cell: (p) => <div><p className="font-semibold">{inr(p.amount)}</p>{p.refundedAmount > 0 && <p className="text-sm text-info">{inr(p.refundedAmount)} refunded</p>}</div> },
    { key: 'who', header: 'Customer', cell: (p) => (typeof p.customerId === 'object' ? <div><p>{p.customerId?.name}</p><p className="text-sm text-ink-muted">{p.customerId?.email}</p></div> : '—') },
    { key: 'for', header: 'For', hideBelow: 'md', cell: (p) => <div><p>{p.purpose === 'BOOKING' ? p.bookingId?.bookingNumber : p.recurringPlanId?.planNumber}</p><p className="text-sm text-ink-muted">{p.purpose === 'BOOKING' ? 'Single visit' : 'Recurring plan'}</p></div> },
    { key: 'when', header: 'Date', hideBelow: 'lg', cell: (p) => <div><p>{dateTime(p.capturedAt || p.createdAt)}</p><p className="text-sm text-ink-muted">{p.receiptNumber}{p.method ? ` · ${humanize(p.method)}` : ''}</p></div> },
    { key: 'st', header: 'Status', cell: (p) => <PaymentBadge status={p.status} /> },
  ];

  return (
    <>
      <PageHeader title="Payments" subtitle="Razorpay payments in INR. The webhook is the source of truth; refunds go back to the original method." />
      <div className="panel">
        <div className="px-5 pt-2">
          <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={['all', 'CAPTURED', 'CREATED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'].map((s) => ({ value: s, label: s === 'all' ? 'All' : s === 'CREATED' ? 'Awaiting payment' : humanize(s) }))} />
        </div>
        <div className="grid gap-3 border-b border-line p-5 sm:grid-cols-2 lg:grid-cols-[1fr_180px_160px_160px]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" /><Input aria-label="Search payments" className="pl-9" placeholder="Customer, receipt no. or reference" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <Select aria-label="Method" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}><option value="">Any method</option>{PAY_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</Select>
          <Input aria-label="From date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <Input aria-label="To date" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        {list.isError ? <div className="p-5"><ErrorState error={list.error} /></div> : <DataTable columns={columns} rows={list.data?.items} loading={list.isLoading} onRowClick={(p) => setOpen(p._id)} empty={<Empty title="No payments" />} />}
        <Pagination meta={list.data?.meta} onPage={setPage} />
      </div>
      {open && <PaymentDialog id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function PaymentDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['payment', id], queryFn: () => get<Payment>(`/admin/payments/${id}`) });
  const [refunding, setRefunding] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const p = q.data;
  const refundable = p ? p.amount - p.refundedAmount : 0;
  const act = useAction(() => post(`/admin/payments/${id}/refund`, { amount: amount ? Math.round(Number(amount) * 100) : undefined, reason }), {
    success: 'Refund initiated',
    invalidate: [['payment', id], ['payments'], ['booking'], ['dashboard']],
    onDone: () => { setRefunding(false); setAmount(''); setReason(''); },
  });
  const amt = amount ? Math.round(Number(amount) * 100) : refundable;
  return (
    <Dialog open onClose={onClose} wide title={p ? `${inr(p.amount)} · ${p.receiptNumber}` : 'Payment'} footer={p && ['CAPTURED', 'PARTIALLY_REFUNDED'].includes(p.status) && !refunding ? <Button variant="danger" onClick={() => setRefunding(true)}>Refund</Button> : undefined}>
      {q.isLoading && <Skeleton className="h-40" />}
      {p && (
        <div className="space-y-6">
          <KeyVal items={[
            ['Status', <PaymentBadge key="s" status={p.status} />],
            ['For', p.bookingId ? <Link key="b" className="link" href={`/bookings/${p.bookingId._id}`}>{p.bookingId.bookingNumber}</Link> : p.recurringPlanId ? <Link key="r" className="link" href={`/recurring-plans/${p.recurringPlanId._id}`}>{p.recurringPlanId.planNumber}</Link> : '—'],
            ['Captured', dateTime(p.capturedAt)],
            ['Method', humanize(p.method)],
            ['Razorpay order', p.razorpay?.orderId],
            ['Razorpay payment', p.razorpay?.paymentId],
            ['Refunded', inr(p.refundedAmount)],
            ['Failure reason', p.failureReason],
          ]} />
          {refunding && (
            <div className="rounded-xl border border-danger/30 p-4">
              <h3 className="mb-3 font-semibold">Refund up to {inr(refundable)}</h3>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <Field label="Amount (INR)" hint="Leave empty for full remaining"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(refundable / 100)} /></Field>
                <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[40px]" /></Field>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setRefunding(false)}>Cancel</Button>
                <Button variant="danger" onClick={() => act.mutate(undefined)} loading={act.isPending} disabled={reason.trim().length < 3 || amt <= 0 || amt > refundable || Number.isNaN(amt)}>Refund {inr(amt)}</Button>
              </div>
            </div>
          )}
          <div>
            <h3 className="mb-2 font-semibold">Refunds</h3>
            {p.refunds?.length ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {p.refunds.map((r) => (
                  <li key={r._id} className="flex items-center justify-between gap-3 px-3 py-2 text-[15px]">
                    <span>{inr(r.amount)} <span className="text-sm text-ink-muted">· {dateTime(r.createdAt)} · {r.reason}</span></span>
                    <Badge tone={r.status === 'PROCESSED' ? 'ok' : r.status === 'FAILED' ? 'danger' : 'warn'}>{humanize(r.status)}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-ink-muted">None.</p>}
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Gateway events</h3>
            {p.transactions?.length ? (
              <ul className="space-y-1 text-sm">
                {p.transactions.map((t) => <li key={t._id}>{dateTime(t.createdAt)} · {t.event || t.type} · {humanize(t.source)} · {humanize(t.status)}</li>)}
              </ul>
            ) : <p className="text-sm text-ink-muted">No gateway events recorded.</p>}
          </div>
        </div>
      )}
    </Dialog>
  );
}

export default function PaymentsPage() {
  return <Suspense><Inner /></Suspense>;
}
