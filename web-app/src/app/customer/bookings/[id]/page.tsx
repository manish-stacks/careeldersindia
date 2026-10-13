'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useToast } from '@/components/ui/toast';
import { payFor } from '@/lib/razorpay';
import { PageHeader, Panel, KeyVal, ErrorState, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { BookingBadge, PaymentBadge } from '@/components/ui/status';
import { PdfButton } from '@/components/portal/pdf-button';
import { dateTime, inr } from '@/lib/utils';
import { VisitRecord } from '@/components/bookings/visit-record';
import type { Visit } from '@/lib/types';
import type { CustomerBooking } from '@/components/portal/booking-row';

const CANCELLABLE = ['PENDING_PAYMENT', 'PAYMENT_SUCCESS', 'PENDING_ADMIN_VERIFICATION', 'VERIFIED', 'ASSISTANT_ASSIGNED', 'ASSISTANT_ACCEPTED', 'ASSISTANT_REJECTED', 'RESCHEDULED'];
type Detail = CustomerBooking & { customerNotes?: string; reportId?: string };

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['customer', 'booking', id], queryFn: () => get<Detail>(`/customer/bookings/${id}`) });
  const done = ['VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED'].includes(q.data?.status || '');
  const visit = useQuery({ queryKey: ['customer', 'booking', id, 'visit'], queryFn: () => get<Visit>(`/customer/bookings/${id}/visit`), enabled: done });
  const keys = [['customer', 'booking', id], ['customer', 'bookings'], ['customer', 'home']];
  const pay = useAction(() => payFor({ bookingId: id }), { invalidate: keys, onDone: (r) => r === 'paid' && toast.success('Payment received', 'Your visit is now with our care desk for verification.') });
  const cancel = useAction(() => post(`/customer/bookings/${id}/cancel`, { reason: reason.trim() }), { success: 'Visit cancelled', invalidate: keys, onDone: () => setCancelOpen(false) });

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const b = q.data;
  return (
    <div className="space-y-5">
      <PageHeader back={{ href: '/customer/bookings', label: 'Visits' }} title={`${b.serviceSnapshot?.name || 'Home visit'} · ${b.bookingNumber}`} subtitle={<BookingBadge status={b.status} />}
        actions={<div className="flex flex-wrap gap-2">
          {b.status === 'PENDING_PAYMENT' && <Button onClick={() => pay.mutate(undefined)} loading={pay.isPending}>Pay {inr(b.price?.amount)}</Button>}
          {CANCELLABLE.includes(b.status) && <Button variant="danger" onClick={() => setCancelOpen(true)}>Cancel visit</Button>}
          {b.reportId && <PdfButton reportId={b.reportId} />}
        </div>} />
      <Panel title="Visit details">
        <KeyVal cols={2} items={[
          ['Parent', b.parentSnapshot?.fullName],
          ['Date and time', dateTime(b.scheduledAt)],
          ['Duration', `${b.durationMinutes} minutes`],
          ['Assistant', b.assistant ? `${b.assistant.name}${b.assistant.mobile ? ` · ${b.assistant.mobile}` : ''}` : 'Not assigned yet'],
          ['Price', inr(b.price?.amount)],
          ['Payment', <PaymentBadge key="p" status={b.paymentStatus} />],
          ['Address', [b.addressSnapshot?.line1, b.addressSnapshot?.city, b.addressSnapshot?.pincode].filter(Boolean).join(', ')],
          ['Your notes', b.customerNotes || '—'],
        ]} />
      </Panel>
      {q.data.status === 'VISIT_STARTED' && <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm text-ink-soft">The visit is in progress. You will see the full summary here as soon as it is complete.</p>}
      {done && (
        <Panel title="Visit summary" action={b.reportId ? <PdfButton reportId={b.reportId} /> : undefined}>
          {visit.isLoading ? <Skeleton className="h-32 w-full" /> : visit.data ? <VisitRecord visit={visit.data} readOnly /> : <p className="text-ink-muted">The summary is being prepared.</p>}
        </Panel>
      )}
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this visit?" description="Refunds follow our cancellation policy."
        footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep visit</Button><Button variant="danger" onClick={() => cancel.mutate(undefined)} loading={cancel.isPending} disabled={reason.trim().length < 3}>Cancel visit</Button></>}>
        <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Dialog>
    </div>
  );
}
