'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { del, get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn, dateOnly, dateTime, humanize, inr } from '@/lib/utils';
import type { BookingStatus } from '@/lib/types';
import { ErrorState, KeyVal, PageHeader, Panel, Skeleton } from '@/components/ui/misc';
import { Badge, BookingBadge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { PLAN_TONE, freqLabel, type Plan } from '@/components/plans/shared';
import { EditPlanDialog, PlanPaymentDialog, RenewPlanDialog } from '@/components/plans/plan-dialogs';
import { PaymentBadge } from '@/components/ui/status';
import type { Payment } from '@/lib/types';

type Detail = { plan: Plan; bookings: { _id: string; bookingNumber: string; scheduledAt: string; status: BookingStatus; occurrenceIndex: number }[]; schedulePreview: string[] };

export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['plan', id], queryFn: () => get<Detail>(`/admin/recurring-plans/${id}`) });
  const [cancel, setCancel] = useState(false);
  const [dlg, setDlg] = useState<'edit' | 'renew' | 'pay' | null>(null);
  const planQ = q.data?.plan;
  const pay = useQuery({ queryKey: ['payments', 'plan', planQ?.paymentId], queryFn: () => get<Payment>(`/admin/payments/${planQ?.paymentId}`), enabled: !!planQ?.paymentId });
  const router = useRouter();
  const remove = useAction(() => del(`/admin/recurring-plans/${id}`), { success: 'Plan deleted', invalidate: [['plans']], onDone: () => router.push('/recurring-plans') });
  const inv = [['plan', id], ['plans'], ['bookings']];
  const pause = useAction(() => post(`/admin/recurring-plans/${id}/pause`), { success: 'Plan paused. No new visits will be created.', invalidate: inv });
  const resume = useAction(() => post(`/admin/recurring-plans/${id}/resume`), { success: 'Plan resumed', invalidate: inv });
  const gen = useAction(() => post<{ generated: number }>(`/admin/recurring-plans/${id}/generate`), { success: (r) => `${r.data.generated} visit(s) created`, invalidate: inv });

  if (q.isLoading) return <Skeleton className="h-80" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { plan: p, bookings, schedulePreview } = q.data;
  const byIndex = new Map(bookings.map((b) => [b.occurrenceIndex, b]));

  return (
    <>
      <PageHeader
        back={{ href: '/recurring-plans', label: 'Recurring plans' }}
        title={`${p.parentId?.fullName}: ${p.serviceId?.name}`}
        subtitle={<span className="flex flex-wrap items-center gap-3"><Badge tone={PLAN_TONE[p.status]}>{humanize(p.status)}</Badge>{p.planNumber} · {freqLabel(p)} at {p.timeOfDay} IST</span>}
        actions={
          <>
            {p.status !== 'CANCELLED' && <Button onClick={() => setDlg('edit')}>Modify plan</Button>}
            {!['CANCELLED', 'PENDING_PAYMENT'].includes(p.status) && <Button variant="secondary" onClick={() => setDlg('renew')}>Renew</Button>}
            {p.status === 'ACTIVE' && <Button variant="secondary" onClick={() => gen.mutate(undefined)} loading={gen.isPending}>Create due visits now</Button>}
            {p.status === 'ACTIVE' && <Button variant="secondary" onClick={() => pause.mutate(undefined)} loading={pause.isPending}>Pause</Button>}
            {p.status === 'PAUSED' && <Button onClick={() => resume.mutate(undefined)} loading={resume.isPending}>Resume</Button>}
            {!['CANCELLED', 'COMPLETED'].includes(p.status) && <Button variant="danger" onClick={() => setCancel(true)}>Cancel plan</Button>}
            <Button variant="secondary" onClick={() => { if (window.confirm('Delete this plan and its upcoming visits? Only possible if no visit has started and nothing was paid.')) remove.mutate(undefined); }} loading={remove.isPending}>Delete</Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title={`Schedule (${p.generatedCount} of ${p.totalVisits} created)`} bodyClass="p-0">
          <ol>
            {schedulePreview.map((at, i) => {
              const b = byIndex.get(i);
              return (
                <li key={i} className={cn('flex items-center gap-4 border-b border-line px-5 py-3 last:border-0', !b && 'text-ink-muted')}>
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold', b ? 'bg-ink text-white' : 'bg-canvas ring-1 ring-line')}>{i + 1}</span>
                  <span className="flex-1">{dateTime(b?.scheduledAt || at)}</span>
                  {b ? (
                    <Link href={`/bookings/${b._id}`} className="flex items-center gap-3 hover:underline"><span className="hidden text-sm sm:inline">{b.bookingNumber}</span><BookingBadge status={b.status} /></Link>
                  ) : (
                    <span className="text-sm">Created 2 weeks before</span>
                  )}
                </li>
              );
            })}
          </ol>
        </Panel>
        <div className="space-y-6">
          <Panel title="Plan">
            <KeyVal cols={1} items={[
              ['Family', p.customerId ? <Link key="c" href={`/customers/${p.customerId._id}`} className="link">{p.customerId.name}</Link> : '—'],
              ['Parent', p.parentId ? <Link key="p" href={`/parents/${p.parentId._id}`} className="link">{p.parentId.fullName}</Link> : '—'],
              ['Period', `${dateOnly(p.startDate)} → ${p.endDate ? dateOnly(p.endDate) : '—'}`],
              ['Frequency', freqLabel(p)],
              ['Prepaid', `${inr(p.totalAmount)} (${inr(p.pricePerVisit)} per visit)`],
              ['Notes from family', p.notes || '—'],
              ...(p.cancellation?.reason ? [['Cancelled', `${dateTime(p.cancellation.at)}: ${p.cancellation.reason}`] as [string, string]] : []),
            ]} />
          </Panel>
          <Panel title="Payment" action={p.status !== 'CANCELLED' && <Button size="sm" variant="secondary" onClick={() => setDlg('pay')}>{p.paymentId ? 'Edit' : 'Record payment'}</Button>}>
            {pay.data ? (
              <KeyVal cols={1} items={[['Status', <PaymentBadge key="s" status={pay.data.status} />], ['Amount', inr(pay.data.amount)], ['Method', humanize(pay.data.method)], ['Reference', pay.data.reference || '—'], ['Receipt', pay.data.receiptNumber], ['Paid on', dateTime(pay.data.capturedAt)], ['Note', pay.data.note || '—']]} />
            ) : <p className="text-ink-muted">{p.paymentId ? 'Loading…' : 'No payment recorded yet.'}</p>}
          </Panel>
          <p className="text-sm text-ink-muted">Cancelling refunds unused visits automatically. Visits already in progress are not affected.</p>
        </div>
      </div>
      {dlg === 'edit' && <EditPlanDialog plan={p} onClose={() => setDlg(null)} />}
      {dlg === 'renew' && <RenewPlanDialog plan={p} onClose={() => setDlg(null)} />}
      {dlg === 'pay' && <PlanPaymentDialog plan={p} payment={pay.data || null} onClose={() => setDlg(null)} />}
      {cancel && <CancelPlan id={id} onClose={() => setCancel(false)} />}
    </>
  );
}

function CancelPlan({ id, onClose }: { id: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const act = useAction(() => post<{ cancelledVisits: number; unusedVisits: number }>(`/admin/recurring-plans/${id}/cancel`, { reason }), {
    success: (r) => `Plan cancelled · ${r.data.cancelledVisits} upcoming visits cancelled · ${r.data.unusedVisits} refunded`,
    invalidate: [['plan', id], ['plans'], ['bookings'], ['payments']],
    onDone: onClose,
  });
  return (
    <Dialog open onClose={onClose} title="Cancel this plan?" description="Upcoming visits that haven't started are cancelled and unused visits are refunded." footer={<><Button variant="secondary" onClick={onClose}>Keep plan</Button><Button variant="danger" onClick={() => act.mutate(undefined)} loading={act.isPending} disabled={reason.trim().length < 3}>Cancel plan</Button></>}>
      <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Dialog>
  );
}
