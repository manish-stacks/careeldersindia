'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPaged, patch, post, put } from '@/lib/api';
import { useAction, todayIST } from '@/lib/hooks';
import { dateOnly, inr } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { FREQUENCIES, PAY_METHODS, addDays, countVisits, type Plan } from './shared';

type Opt = { _id: string; name: string };
const INV = (_customerId?: string, _planId?: string): string[][] => [['customers'], ['customer'], ['customer-bookings'], ['plans'], ['plan'], ['payments'], ['recurring-plans']];

function FrequencyFields({ f, set }: { f: { frequency: string; intervalDays: string }; set: (k: string, v: string) => void }) {
  return (
    <>
      <Field label="Visit frequency"><Select value={f.frequency} onChange={(e) => set('frequency', e.target.value)}>{FREQUENCIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select></Field>
      {f.frequency === 'CUSTOM' ? <Field label="Days between visits"><Input type="number" min={1} max={90} value={f.intervalDays} onChange={(e) => set('intervalDays', e.target.value)} /></Field> : <span />}
    </>
  );
}

function AssistantSelect({ value, onChange, none }: { value: string; onChange: (v: string) => void; none: string }) {
  const assistants = useQuery({ queryKey: ['assistants', 'approved-all'], queryFn: () => getPaged<{ userId: Opt }>('/admin/assistants?verificationStatus=APPROVED&limit=100') });
  return <Select value={value} onChange={(e) => onChange(e.target.value)}><option value="">{none}</option>{(assistants.data?.items || []).map((a) => <option key={a.userId._id} value={a.userId._id}>{a.userId.name}</option>)}</Select>;
}

/** Change a plan after it was sold: schedule, end date, assistant, price. Future visits that have not started are rebuilt. */
export function EditPlanDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const tomorrow = addDays(todayIST(), 1);
  const [f, setF] = useState({
    frequency: plan.frequency, intervalDays: String(plan.intervalDays || 1), time: plan.timeOfDay, fromDate: tomorrow, endDate: plan.endDate || '',
    assistantId: plan.preferredAssistantId || '', price: String(Math.round(plan.pricePerVisit / 100)), notes: plan.notes || '',
  });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const preview = countVisits(f.fromDate, f.endDate, f.frequency, Number(f.intervalDays));
  const body = {
    frequency: f.frequency, intervalDays: f.frequency === 'CUSTOM' ? Number(f.intervalDays) : undefined, time: f.time, fromDate: f.fromDate, endDate: f.endDate || undefined,
    assistantId: f.assistantId || null, pricePerVisit: Math.round(Number(f.price) * 100), notes: f.notes,
  };
  const save = useAction(() => patch(`/admin/recurring-plans/${plan._id}`, body), { success: 'Plan updated — upcoming visits rebuilt', invalidate: INV((typeof plan.customerId === 'object' ? plan.customerId?._id : undefined), plan._id), onDone: onClose });
  const valid = /^\d{2}:\d{2}$/.test(f.time) && f.fromDate && f.endDate >= f.fromDate && Number(f.price) >= 0;
  return (
    <Dialog open onClose={onClose} wide title={`Modify ${plan.planNumber}`} description="Visits that already started or finished are never changed. Upcoming, not-yet-started visits from the change date are rebuilt on the new schedule."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid}>Save changes</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FrequencyFields f={f} set={set} />
        <Field label="New schedule starts on" hint="Earliest: tomorrow"><Input type="date" min={tomorrow} value={f.fromDate} onChange={(e) => set('fromDate', e.target.value)} /></Field>
        <Field label="Plan ends on" hint={plan.endDate ? `Currently ends ${dateOnly(plan.endDate)}` : undefined}><Input type="date" min={f.fromDate} value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Visit time (24h)"><Input value={f.time} onChange={(e) => set('time', e.target.value)} placeholder="09:00" /></Field>
        <Field label="Price per visit (₹)"><Input type="number" min={0} value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
        <Field label="Assistant for all visits" className="sm:col-span-2"><AssistantSelect value={f.assistantId} onChange={(v) => set('assistantId', v)} none="No fixed assistant" /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <p className="sm:col-span-2 rounded-lg bg-canvas px-4 py-3 text-sm">From {f.fromDate ? dateOnly(f.fromDate) : '—'} to {f.endDate ? dateOnly(f.endDate) : '—'}: <b>{preview}</b> new visit{preview === 1 ? '' : 's'} will be scheduled.</p>
      </div>
    </Dialog>
  );
}

/** New plan that continues after this one. Admin renewals go live immediately (payment is recorded offline). */
export function RenewPlanDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const startDefault = (() => { const after = plan.endDate ? addDays(plan.endDate, 1) : addDays(todayIST(), 1); return after > addDays(todayIST(), 1) ? after : addDays(todayIST(), 1); })();
  const span = plan.endDate && plan.startDate ? Math.max(0, Math.round((Date.parse(plan.endDate) - Date.parse(plan.startDate)) / 86400000)) : 29;
  const [f, setF] = useState({ startDate: startDefault, endDate: addDays(startDefault, span), frequency: plan.frequency, intervalDays: String(plan.intervalDays || 1), assistantId: plan.preferredAssistantId || '', price: String(Math.round(plan.pricePerVisit / 100)) });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const n = countVisits(f.startDate, f.endDate, f.frequency, Number(f.intervalDays));
  const body = { startDate: f.startDate, endDate: f.endDate, frequency: f.frequency, intervalDays: f.frequency === 'CUSTOM' ? Number(f.intervalDays) : undefined, assistantId: f.assistantId || undefined, pricePerVisit: Math.round(Number(f.price) * 100) };
  const save = useAction(() => post(`/admin/recurring-plans/${plan._id}/renew`, body), { success: 'Plan renewed', invalidate: INV((typeof plan.customerId === 'object' ? plan.customerId?._id : undefined), plan._id), onDone: onClose });
  return (
    <Dialog open onClose={onClose} wide title={`Renew ${plan.planNumber}`} description="Creates a new plan with the same services, starting after this one. The customer is notified."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={n < 1}>Renew plan</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts on"><Input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Ends on"><Input type="date" min={f.startDate} value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <FrequencyFields f={f} set={set} />
        <Field label="Price per visit (₹)"><Input type="number" min={0} value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
        <Field label="Assistant for all visits" className="sm:col-span-2"><AssistantSelect value={f.assistantId} onChange={(v) => set('assistantId', v)} none="Same as before / assign later" /></Field>
        <p className="sm:col-span-2 rounded-lg bg-canvas px-4 py-3 text-sm"><b>{n}</b> visits · total {inr(n * Math.round(Number(f.price) * 100))}</p>
      </div>
    </Dialog>
  );
}

type Pay = { _id: string; amount: number; status: string; method?: string; reference?: string; note?: string; capturedAt?: string; manual?: boolean; razorpay?: { paymentId?: string } };
/** Record or edit payment details of a plan (offline payments: UPI / cash / bank transfer…). */
export function PlanPaymentDialog({ plan, payment, onClose }: { plan: Plan; payment?: Pay | null; onClose: () => void }) {
  const locked = !!payment?.razorpay?.paymentId && !payment.manual;
  const [f, setF] = useState({ amount: String(Math.round((payment?.amount ?? plan.totalAmount) / 100)), status: payment?.status && ['CREATED', 'CAPTURED', 'FAILED'].includes(payment.status) ? payment.status : 'CAPTURED', method: payment?.method || 'UPI', reference: payment?.reference || '', note: payment?.note || '', paidOn: (payment?.capturedAt || '').slice(0, 10) || todayIST() });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const body = { ...(locked ? {} : { amount: Math.round(Number(f.amount) * 100), status: f.status, capturedAt: f.status === 'CAPTURED' ? `${f.paidOn}T12:00:00+05:30` : undefined }), method: f.method, reference: f.reference, note: f.note };
  const save = useAction(() => (payment ? patch(`/admin/payments/${payment._id}`, body) : put(`/admin/recurring-plans/${plan._id}/payment`, body)), { success: 'Payment details saved', invalidate: INV((typeof plan.customerId === 'object' ? plan.customerId?._id : undefined), plan._id), onDone: onClose });
  return (
    <Dialog open onClose={onClose} title={payment ? 'Edit payment details' : 'Record payment'} description={locked ? 'Captured by the payment gateway: amount and status are locked.' : `Plan ${plan.planNumber}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (₹)"><Input type="number" min={0} disabled={locked} value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
        <Field label="Status"><Select disabled={locked} value={f.status} onChange={(e) => set('status', e.target.value)}><option value="CAPTURED">Paid</option><option value="CREATED">Pending</option><option value="FAILED">Failed</option></Select></Field>
        <Field label="Method"><Select value={f.method} onChange={(e) => set('method', e.target.value)}>{PAY_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</Select></Field>
        <Field label="Paid on"><Input type="date" disabled={locked || f.status !== 'CAPTURED'} value={f.paidOn} onChange={(e) => set('paidOn', e.target.value)} /></Field>
        <Field label="Reference / UTR / receipt no." className="sm:col-span-2"><Input value={f.reference} onChange={(e) => set('reference', e.target.value)} /></Field>
        <Field label="Note" className="sm:col-span-2"><Textarea value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
