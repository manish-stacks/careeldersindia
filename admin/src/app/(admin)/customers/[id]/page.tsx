'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BadgeCheck, Pencil, Trash2 } from 'lucide-react';
import { get, getPaged, post } from '@/lib/api';
import { useAction, useDebounced } from '@/lib/hooks';
import { age, dateOnly, dateTime, humanize, inr, toQuery } from '@/lib/utils';
import type { Booking, BookingStatus, User, Payment } from '@/lib/types';
import { Empty, ErrorState, KeyVal, PageHeader, Pagination, Panel, Skeleton } from '@/components/ui/misc';
import { Badge, BookingBadge, OverallBadge, PaymentBadge, bookingLabel } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog } from '@/components/ui/dialog';
import { AddParentDialog, CreatePlanDialog, LoginToggleButton, ResetPasswordButton } from '@/components/people/admin-dialogs';
import { DeleteParentDialog, EditParentDialog, type ParentFull } from '@/components/people/parent-dialogs';
import { EditPlanDialog, PlanPaymentDialog, RenewPlanDialog } from '@/components/plans/plan-dialogs';
import { PLAN_TONE, freqLabel, type Plan } from '@/components/plans/shared';

type ParentRow = ParentFull & { lastOverallStatus?: string; membership?: { permissions: string[]; isOwner: boolean; relation?: string } };
type Detail = { user: User; parents: ParentRow[]; payments: (Omit<Payment, 'recurringPlanId'> & { recurringPlanId?: string })[]; plans: Plan[] };
type BookingRow = Booking & { parentSnapshot: { fullName: string }; serviceSnapshot: { name: string }; price: { amount: number } };
type ReportRow = { _id: string; reportNumber: string; visitDate: string; overallStatus: string; serviceName?: string; data?: { patient?: { name?: string } } };
const STATUSES: BookingStatus[] = ['PENDING_ADMIN_VERIFICATION', 'VERIFIED', 'ASSISTANT_ASSIGNED', 'ASSISTANT_ACCEPTED', 'ON_THE_WAY', 'VISIT_STARTED', 'VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED', 'NO_SHOW', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_ADMIN'];
const ENDED_PLAN = ['CANCELLED'];
const CANCELLABLE = ['PENDING_ADMIN_VERIFICATION', 'VERIFIED', 'ASSISTANT_ASSIGNED', 'ASSISTANT_REJECTED', 'ASSISTANT_ACCEPTED'];

function CancelBookingDialog({ booking, onClose }: { booking: { _id: string; bookingNumber: string }; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const act = useAction(() => post(`/admin/bookings/${booking._id}/cancel`, { reason: reason.trim() }), { success: 'Visit cancelled', invalidate: [['customer-bookings'], ['customer'], ['bookings'], ['dashboard']], onDone: onClose });
  return (
    <Dialog open onClose={onClose} title={`Cancel ${booking.bookingNumber}?`} description="The customer and assistant are notified. Paid visits are refunded in full when the admin cancels."
      footer={<><Button variant="secondary" onClick={onClose}>Keep visit</Button><Button variant="danger" onClick={() => act.mutate(undefined)} loading={act.isPending} disabled={reason.trim().length < 3}>Cancel visit</Button></>}>
      <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer asked to cancel" /></Field>
    </Dialog>
  );
}

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => get<Detail>(`/admin/customers/${id}`) });
  const [addParent, setAddParent] = useState(false);
  const [newPlan, setNewPlan] = useState(false);
  const [editParent, setEditParent] = useState<ParentRow | null>(null);
  const [delParent, setDelParent] = useState<ParentRow | null>(null);
  const [cancelB, setCancelB] = useState<{ _id: string; bookingNumber: string } | null>(null);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [renewPlan, setRenewPlan] = useState<Plan | null>(null);
  const [payFor, setPayFor] = useState<{ plan: Plan; payment: Payment | null } | null>(null);

  // filters shared by the bookings + reports panels
  const [parentId, setParentId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [bq, setBq] = useState('');
  const [bPage, setBPage] = useState(1);
  const [rPage, setRPage] = useState(1);
  const [pPage, setPPage] = useState(1);
  const search = useDebounced(bq);
  const bParams = { customerId: id, parentId, status, from, to, q: search, page: bPage, limit: 8 };
  const bookings = useQuery({ queryKey: ['customer-bookings', bParams], queryFn: () => getPaged<BookingRow>(`/admin/bookings${toQuery(bParams)}`), placeholderData: keepPreviousData });
  const rParams = { customerId: id, parentId, from, to, page: rPage, limit: 5 };
  const reports = useQuery({ queryKey: ['customer-reports', rParams], queryFn: () => getPaged<ReportRow>(`/admin/reports${toQuery(rParams)}`), placeholderData: keepPreviousData });
  const verify = useAction((bookingId: string) => post(`/admin/bookings/${bookingId}/verify`, {}), { success: 'Visit verified', invalidate: [['customer-bookings'], ['bookings'], ['dashboard']] });

  if (q.isLoading) return <Skeleton className="h-80" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { user, parents, payments, plans } = q.data;
  const active = user.status === 'ACTIVE';
  const refresh = [['customer', id]];
  const resetPage = () => { setBPage(1); setRPage(1); };
  const payPage = payments.slice((pPage - 1) * 6, pPage * 6);
  const planPayment = (p: Plan) => (payments.find((x) => String(x.recurringPlanId) === p._id) as unknown as Payment | undefined) || null;

  return (
    <>
      <PageHeader
        back={{ href: '/customers', label: 'Customers' }}
        title={user.name}
        subtitle={<span className="flex flex-wrap items-center gap-3">{user.email}{user.mobile && <span>{user.mobile}</span>}<Badge tone={active ? 'ok' : 'danger'}>{active ? 'Active' : 'Suspended'}</Badge></span>}
        actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setAddParent(true)}>+ Add parent</Button><Button disabled={!parents.length} onClick={() => setNewPlan(true)}>Create plan</Button><ResetPasswordButton userId={user._id} /><LoginToggleButton userId={user._id} enabled={active} invalidate={[['customer', id], ['customers']]} /></div>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Panel title="Account">
            <KeyVal items={[['Country', user.country], ['Time zone', user.timezone], ['Joined', dateOnly(user.createdAt)], ['Last sign-in', dateTime(user.lastLoginAt)]]} />
          </Panel>
          <Panel title={`Parents (${parents.length})`} bodyClass="p-0">
            <ul>
              {parents.map((p) => (
                <li key={p._id} className="border-b border-line px-5 py-3 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/parents/${p._id}`} className="font-medium hover:underline">{p.fullName}</Link>
                    <span className="flex items-center gap-1">
                      <OverallBadge status={p.lastOverallStatus as never} />
                      <Button size="sm" variant="secondary" aria-label={`Edit ${p.fullName}`} onClick={() => setEditParent(p)}><Pencil className="h-4 w-4" />Edit</Button>
                      <Button size="sm" variant="danger" aria-label={`Delete ${p.fullName}`} onClick={() => setDelParent(p)}><Trash2 className="h-4 w-4" /></Button>
                    </span>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {age(p.dateOfBirth)} yrs · {p.address.city} · {p.membership?.isOwner ? 'Owner' : `${p.membership?.relation || 'Family'}, can ${p.membership?.permissions.map((x) => x.toLowerCase()).join('/')}`}
                  </p>
                </li>
              ))}
              {!parents.length && <li className="px-5 py-6 text-ink-muted">No parents added yet.</li>}
            </ul>
          </Panel>
          <Panel title={`Plans (${plans.length})`} bodyClass="p-0">
            <ul>
              {plans.map((p) => {
                const pay = planPayment(p);
                return (
                  <li key={p._id} className="border-b border-line px-5 py-3 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={`/recurring-plans/${p._id}`} className="font-medium hover:underline">{p.planNumber}</Link>
                        <p className="text-sm text-ink-muted">{freqLabel(p)} · {p.serviceId?.name} for {p.parentId?.fullName}</p>
                        <p className="text-sm text-ink-muted">{dateOnly(p.startDate)} → {p.endDate ? dateOnly(p.endDate) : '—'} · {p.generatedCount}/{p.totalVisits} visits scheduled</p>
                        <p className="text-sm text-ink-muted">{inr(p.totalAmount)} · {pay ? <>Payment: <PaymentBadge status={pay.status} /> {pay.method && humanize(pay.method)}</> : 'No payment recorded'}</p>
                      </div>
                      <Badge tone={PLAN_TONE[p.status]}>{humanize(p.status)}</Badge>
                    </div>
                    {!ENDED_PLAN.includes(p.status) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditPlan(p)}>Modify</Button>
                        {p.status !== 'PENDING_PAYMENT' && <Button size="sm" variant="secondary" onClick={() => setRenewPlan(p)}>Renew</Button>}
                        <Button size="sm" variant="secondary" onClick={() => setPayFor({ plan: p, payment: pay })}>{pay ? 'Edit payment' : 'Record payment'}</Button>
                      </div>
                    )}
                  </li>
                );
              })}
              {!plans.length && <li className="px-5 py-6 text-ink-muted">No plans yet.</li>}
            </ul>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Filter bookings & reports" bodyClass="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select aria-label="Parent" value={parentId} onChange={(e) => { setParentId(e.target.value); resetPage(); }}><option value="">All parents</option>{parents.map((p) => <option key={p._id} value={p._id}>{p.fullName}</option>)}</Select>
            <Select aria-label="Booking status" value={status} onChange={(e) => { setStatus(e.target.value); setBPage(1); }}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{bookingLabel(s)}</option>)}</Select>
            <Input aria-label="From date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); resetPage(); }} />
            <Input aria-label="To date" type="date" value={to} onChange={(e) => { setTo(e.target.value); resetPage(); }} />
            <Input aria-label="Search bookings" placeholder="Booking no. / city" value={bq} onChange={(e) => { setBq(e.target.value); setBPage(1); }} />
          </Panel>

          <Panel title="Recent bookings" bodyClass="p-0" action={<Link className="link text-sm" href={`/bookings?customerId=${user._id}${parentId ? `&parentId=${parentId}` : ''}`}>Open in Bookings</Link>}>
            {bookings.isError ? <div className="p-5"><ErrorState error={bookings.error} retry={() => bookings.refetch()} /></div> : (
              <ul>
                {(bookings.data?.items || []).map((b) => (
                  <li key={b._id} className="flex items-center gap-2 border-b border-line last:border-0">
                    <Link href={`/bookings/${b._id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-5 py-3 hover:bg-canvas/70">
                      <span className="min-w-0">
                        <span className="font-medium">{b.parentSnapshot.fullName}</span> <span className="text-ink-muted">· {b.serviceSnapshot.name}</span>
                        <span className="block text-sm text-ink-muted">{b.bookingNumber} · {dateTime(b.scheduledAt)}</span>
                      </span>
                      <BookingBadge status={b.status} />
                    </Link>
                    <span className="mr-4 flex shrink-0 gap-2">
                      {b.status === 'PENDING_ADMIN_VERIFICATION' && <Button size="sm" loading={verify.isPending && verify.variables === b._id} onClick={() => verify.mutate(b._id)}><BadgeCheck className="h-4 w-4" />Verify</Button>}
                      {CANCELLABLE.includes(b.status) && <Button size="sm" variant="danger" onClick={() => setCancelB({ _id: b._id, bookingNumber: b.bookingNumber })}>Cancel</Button>}
                    </span>
                  </li>
                ))}
                {!bookings.isLoading && !bookings.data?.items.length && <li><Empty title="No bookings match" /></li>}
              </ul>
            )}
            <Pagination meta={bookings.data?.meta} onPage={setBPage} />
          </Panel>

          <Panel title="Reports" bodyClass="p-0" action={<Link className="link text-sm" href="/reports">All reports</Link>}>
            <ul>
              {(reports.data?.items || []).map((r) => (
                <li key={r._id} className="border-b border-line last:border-0">
                  <Link href={`/reports/${r._id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas/70">
                    <span><span className="font-medium">{r.data?.patient?.name || 'Report'}</span> <span className="text-ink-muted">· {r.serviceName}</span><span className="block text-sm text-ink-muted">{r.reportNumber} · {dateOnly(r.visitDate)}</span></span>
                    <OverallBadge status={r.overallStatus as never} />
                  </Link>
                </li>
              ))}
              {!reports.isLoading && !reports.data?.items.length && <li><Empty title="No reports for this filter" /></li>}
            </ul>
            <Pagination meta={reports.data?.meta} onPage={setRPage} />
          </Panel>

          <Panel title="Payment history" bodyClass="p-0" action={<Link className="link text-sm" href={`/payments?customerId=${user._id}`}>Open in Payments</Link>}>
            <div className="grid grid-cols-3 gap-3 border-b border-line p-5 text-sm">
              {[['Paid (net)', inr(payments.filter((x) => ['CAPTURED', 'PARTIALLY_REFUNDED'].includes(x.status)).reduce((n, x) => n + x.amount - (x.refundedAmount || 0), 0))], ['Refunded', inr(payments.reduce((n, x) => n + (x.refundedAmount || 0), 0))], ['Pending / failed', String(payments.filter((x) => ['CREATED', 'FAILED'].includes(x.status)).length)]].map(([k, v]) => <div key={k}><p className="text-ink-muted">{k}</p><p className="text-lg font-semibold">{v}</p></div>)}
            </div>
            <ul>
              {payPage.map((p) => {
                const plan = plans.find((x) => x._id === String(p.recurringPlanId));
                return (
                  <li key={p._id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0">
                    <span>
                      <span className="font-medium">{inr(p.amount)}</span> <span className="text-ink-muted">· {p.receiptNumber}</span>
                      <span className="block text-sm text-ink-muted">{humanize(p.purpose)} · {p.method ? `${humanize(p.method)} · ` : ''}{p.reference ? `Ref ${p.reference} · ` : ''}{dateTime(p.capturedAt || p.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <PaymentBadge status={p.status} />
                      <Button size="sm" variant="secondary" onClick={() => setPayFor({ plan: plan || ({ _id: '', planNumber: p.receiptNumber, totalAmount: p.amount, customerId: { _id: id } } as unknown as Plan), payment: p as unknown as Payment })}><Pencil className="h-4 w-4" />Edit</Button>
                    </span>
                  </li>
                );
              })}
              {!payments.length && <li className="px-5 py-6 text-ink-muted">No payments.</li>}
            </ul>
            <Pagination meta={{ page: pPage, limit: 6, total: payments.length, totalPages: Math.max(1, Math.ceil(payments.length / 6)) }} onPage={setPPage} />
          </Panel>
        </div>
      </div>
      {addParent && <AddParentDialog customerId={id} onClose={() => setAddParent(false)} />}
      {newPlan && <CreatePlanDialog customerId={id} parents={parents} onClose={() => setNewPlan(false)} />}
      {cancelB && <CancelBookingDialog booking={cancelB} onClose={() => setCancelB(null)} />}
      {editParent && <EditParentDialog parent={editParent} invalidate={[...refresh, ['parents']]} onClose={() => setEditParent(null)} />}
      {delParent && <DeleteParentDialog parent={delParent} invalidate={[...refresh, ['parents']]} onClose={() => setDelParent(null)} />}
      {editPlan && <EditPlanDialog plan={editPlan} onClose={() => setEditPlan(null)} />}
      {renewPlan && <RenewPlanDialog plan={renewPlan} onClose={() => setRenewPlan(null)} />}
      {payFor && <PlanPaymentDialog plan={payFor.plan} payment={payFor.payment} onClose={() => setPayFor(null)} />}
    </>
  );
}
