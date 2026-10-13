'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { del, get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { PageHeader, Panel, Empty, ErrorState, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { OverallBadge } from '@/components/ui/status';
import { age, dateOnly } from '@/lib/utils';
import type { OverallStatus } from '@/lib/types';

type Parent = { _id: string; fullName: string; gender: string; dateOfBirth: string; relationToOwner?: string; address?: { line1: string; city: string; pincode: string }; lastVisitAt?: string; lastOverallStatus?: OverallStatus };
const EMPTY = { fullName: '', gender: 'FEMALE', dateOfBirth: '', relationToOwner: '', mobile: '', line1: '', landmark: '', city: '', state: '', pincode: '', bloodGroup: 'UNKNOWN', conditions: '', allergies: '', ecName: '', ecRelation: '', ecMobile: '', instructions: '' };
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function ParentsPage() {
  const q = useQuery({ queryKey: ['customer', 'parents'], queryFn: () => get<Parent[]>('/customer/parents') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const create = useAction(() => post('/customer/parents', {
    fullName: f.fullName.trim(), gender: f.gender, dateOfBirth: f.dateOfBirth,
    ...(f.relationToOwner && { relationToOwner: f.relationToOwner.trim() }),
    ...(f.mobile && { mobile: f.mobile.trim() }),
    address: { line1: f.line1.trim(), ...(f.landmark && { landmark: f.landmark.trim() }), city: f.city.trim(), state: f.state.trim(), pincode: f.pincode.trim() },
    bloodGroup: f.bloodGroup, medicalConditions: list(f.conditions), allergies: list(f.allergies),
    emergencyContacts: [{ name: f.ecName.trim(), ...(f.ecRelation && { relation: f.ecRelation.trim() }), mobile: f.ecMobile.trim() }],
    ...(f.instructions && { specialInstructions: f.instructions.trim() }),
  }), { success: 'Parent added', invalidate: [['customer', 'parents'], ['customer', 'home']], onDone: () => { setOpen(false); setF(EMPTY); } });
  const archive = useAction((id: string) => del(`/customer/parents/${id}`), { success: 'Parent removed', invalidate: [['customer', 'parents'], ['customer', 'home']] });

  const valid = f.fullName.trim().length > 1 && f.dateOfBirth && f.line1.trim().length > 2 && f.city && f.state && /^[1-9][0-9]{5}$/.test(f.pincode) && f.ecName.trim().length > 1 && f.ecMobile;
  return (
    <div className="space-y-5">
      <PageHeader title="My parents" subtitle="People you book visits for." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add parent</Button>} />
      {q.isLoading ? <Skeleton className="h-40 w-full" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <Panel bodyClass="p-0 divide-y divide-line">
          {q.data?.length ? q.data.map((p) => (
            <div key={p._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-semibold">{p.fullName} <span className="font-normal text-ink-muted">· {age(p.dateOfBirth)} · {p.relationToOwner || p.gender.toLowerCase()}</span></p>
                <p className="text-sm text-ink-muted">{[p.address?.line1, p.address?.city, p.address?.pincode].filter(Boolean).join(', ')}{p.lastVisitAt ? ` · last visit ${dateOnly(p.lastVisitAt)}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                {p.lastOverallStatus && <OverallBadge status={p.lastOverallStatus} />}
                <Link href={`/customer/book?parent=${p._id}`} className="rounded-lg bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand">Book visit</Link>
                <Button size="sm" variant="danger" onClick={() => confirm(`Remove ${p.fullName}?`) && archive.mutate(p._id)}>Remove</Button>
              </div>
            </div>
          )) : <Empty title="No parents added yet" body="Add a parent to start booking visits." />}
        </Panel>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} wide title="Add a parent" description="These details help the assistant prepare for the visit."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => create.mutate(undefined)} loading={create.isPending} disabled={!valid}>Save parent</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={f.fullName} onChange={set('fullName')} /></Field>
          <Field label="Relation to you" hint="For example Mother"><Input value={f.relationToOwner} onChange={set('relationToOwner')} /></Field>
          <Field label="Gender"><Select value={f.gender} onChange={set('gender')}><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></Select></Field>
          <Field label="Date of birth"><Input type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} /></Field>
          <Field label="Parent's mobile (optional)" hint="With country code, for example +919876543210"><Input value={f.mobile} onChange={set('mobile')} /></Field>
          <Field label="Blood group"><Select value={f.bloodGroup} onChange={set('bloodGroup')}>{['UNKNOWN', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => <option key={g} value={g}>{g === 'UNKNOWN' ? 'Not known' : g}</option>)}</Select></Field>
          <Field label="Address" className="sm:col-span-2"><Input value={f.line1} onChange={set('line1')} placeholder="House number, street, area" /></Field>
          <Field label="Landmark (optional)"><Input value={f.landmark} onChange={set('landmark')} /></Field>
          <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
          <Field label="State"><Input value={f.state} onChange={set('state')} /></Field>
          <Field label="PIN code"><Input value={f.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={6} /></Field>
          <Field label="Medical conditions" hint="Separate with commas" className="sm:col-span-2"><Input value={f.conditions} onChange={set('conditions')} placeholder="Diabetes, Hypertension" /></Field>
          <Field label="Allergies" hint="Separate with commas" className="sm:col-span-2"><Input value={f.allergies} onChange={set('allergies')} /></Field>
          <Field label="Emergency contact name"><Input value={f.ecName} onChange={set('ecName')} /></Field>
          <Field label="Emergency contact mobile"><Input value={f.ecMobile} onChange={set('ecMobile')} placeholder="+919876543210" /></Field>
          <Field label="Emergency contact relation (optional)"><Input value={f.ecRelation} onChange={set('ecRelation')} /></Field>
          <Field label="Special instructions (optional)" className="sm:col-span-2"><Textarea rows={2} value={f.instructions} onChange={set('instructions')} /></Field>
        </div>
      </Dialog>
    </div>
  );
}
