'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import { payFor } from '@/lib/razorpay';
import { useToast } from '@/components/ui/toast';
import { PageHeader, Panel, Empty, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { inr } from '@/lib/utils';
import { todayIST } from '@/lib/hooks';
import { useQueryClient } from '@tanstack/react-query';

type Parent = { _id: string; fullName: string };
type Service = { _id: string; name: string; basePrice: number; durationMinutes: number; description?: string };
const TIMES = Array.from({ length: 25 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

function BookForm() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useSearchParams();
  const parents = useQuery({ queryKey: ['customer', 'parents'], queryFn: () => get<Parent[]>('/customer/parents') });
  const services = useQuery({ queryKey: ['public-services'], queryFn: () => get<Service[]>('/services') });
  const [f, setF] = useState({ parentId: params.get('parent') || '', serviceId: '', date: '', time: '10:00', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const service = services.data?.find((s) => s._id === f.serviceId);

  if (parents.isLoading || services.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!parents.data?.length) return <Panel><Empty title="Add a parent first" body="You need at least one parent to book a visit." action={<Link href="/customer/parents" className="font-semibold text-brand">Add a parent</Link>} /></Panel>;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const b = (await post<{ _id: string }>('/customer/bookings', { parentId: f.parentId, serviceId: f.serviceId, date: f.date, time: f.time, ...(f.notes.trim() && { customerNotes: f.notes.trim() }) })).data;
      qc.invalidateQueries({ queryKey: ['customer'] });
      try {
        const r = await payFor({ bookingId: b._id });
        if (r === 'paid') toast.success('Payment received', 'Your visit is booked.');
      } catch (e) {
        toast.error('Payment not completed', e instanceof Error ? e.message : 'You can pay from the visit page.');
      }
      router.push(`/customer/bookings/${b._id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the booking');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Parent"><Select value={f.parentId} onChange={set('parentId')}><option value="">Select a parent</option>{parents.data.map((p) => <option key={p._id} value={p._id}>{p.fullName}</option>)}</Select></Field>
        <Field label="Service"><Select value={f.serviceId} onChange={set('serviceId')}><option value="">Select a service</option>{services.data?.map((s) => <option key={s._id} value={s._id}>{s.name} · {inr(s.basePrice)}</option>)}</Select></Field>
        <Field label="Date"><Input type="date" min={todayIST()} value={f.date} onChange={set('date')} /></Field>
        <Field label="Time (India time)"><Select value={f.time} onChange={set('time')}>{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
        <Field label="Notes for the assistant (optional)" className="sm:col-span-2"><Textarea rows={3} value={f.notes} onChange={set('notes')} /></Field>
      </div>
      {service && <p className="mt-4 rounded-lg bg-brand-soft px-4 py-3 text-sm text-ink-soft">{service.name}: about {service.durationMinutes} minutes. You will pay <b>{inr(service.basePrice)}</b> securely online to confirm the visit.</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-5"><Button size="lg" onClick={submit} loading={busy} disabled={!f.parentId || !f.serviceId || !f.date}>Book and pay</Button></div>
    </Panel>
  );
}

export default function BookPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Book a visit" subtitle="Choose who, what and when. Our care desk verifies every booking." />
      <Suspense><BookForm /></Suspense>
    </div>
  );
}
