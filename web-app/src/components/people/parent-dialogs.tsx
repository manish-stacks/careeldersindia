'use client';
import { lookupPincode } from '@/lib/pincode';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { del, patch } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';

export type ParentFull = {
  _id: string; fullName: string; gender: string; dateOfBirth: string; relationToOwner?: string; mobile?: string; bloodGroup?: string;
  address: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string };
  emergencyContacts?: { name: string; relation?: string; mobile: string }[]; medicalConditions?: string[]; allergies?: string[]; specialInstructions?: string;
};
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** Fix wrong details of a parent / patient. */
export function EditParentDialog({ parent, invalidate, onClose }: { parent: ParentFull; invalidate: unknown[][]; onClose: () => void }) {
  const ec = parent.emergencyContacts?.[0];
  const [f, setF] = useState({
    fullName: parent.fullName, gender: parent.gender, dateOfBirth: (parent.dateOfBirth || '').slice(0, 10), relationToOwner: parent.relationToOwner || '', mobile: parent.mobile || '', bloodGroup: parent.bloodGroup || 'UNKNOWN',
    line1: parent.address?.line1 || '', line2: parent.address?.line2 || '', city: parent.address?.city || '', state: parent.address?.state || '', pincode: parent.address?.pincode || '',
    ecName: ec?.name || '', ecMobile: ec?.mobile || '', conditions: (parent.medicalConditions || []).join(', '), allergies: (parent.allergies || []).join(', '), notes: parent.specialInstructions || '',
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const setPin = async (v: string) => {
    set('pincode', v);
    const r = await lookupPincode(v.trim());
    if (r) setF((s) => ({ ...s, pincode: v, city: r.city, state: r.state }));
  };
  const body = {
    fullName: f.fullName.trim(), gender: f.gender, dateOfBirth: f.dateOfBirth, relationToOwner: f.relationToOwner.trim() || undefined, mobile: f.mobile.trim() || undefined, bloodGroup: f.bloodGroup,
    address: { line1: f.line1.trim(), line2: f.line2.trim() || undefined, city: f.city.trim(), state: f.state.trim(), pincode: f.pincode.trim() },
    emergencyContacts: [{ name: f.ecName.trim(), relation: ec?.relation, mobile: f.ecMobile.trim() }, ...(parent.emergencyContacts || []).slice(1)],
    medicalConditions: list(f.conditions), allergies: list(f.allergies), specialInstructions: f.notes.trim() || undefined,
  };
  const save = useAction(() => patch(`/admin/parents/${parent._id}`, body), { success: 'Parent details updated', invalidate: invalidate as never, onDone: onClose });
  const valid = body.fullName.length >= 2 && f.dateOfBirth && body.address.line1.length >= 3 && body.address.city && body.address.state && body.address.pincode && body.emergencyContacts[0].name.length >= 2 && body.emergencyContacts[0].mobile;
  return (
    <Dialog open onClose={onClose} wide title={`Edit ${parent.fullName}`} description="Correct any wrong details. Visits created later use the new details."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid}>Save changes</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} /></Field>
        <Field label="Relation to customer"><Input value={f.relationToOwner} onChange={(e) => set('relationToOwner', e.target.value)} /></Field>
        <Field label="Gender"><Select value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></Select></Field>
        <Field label="Date of birth"><Input type="date" value={f.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></Field>
        <Field label="Patient mobile" hint="The assistant calls this number."><Input value={f.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="+91…" /></Field>
        <Field label="Blood group"><Select value={f.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>{['UNKNOWN', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}</Select></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.line1} onChange={(e) => set('line1', e.target.value)} /></Field>
        <Field label="Address line 2" className="sm:col-span-2"><Input value={f.line2} onChange={(e) => set('line2', e.target.value)} /></Field>
        <Field label="City"><Input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="State"><Input value={f.state} onChange={(e) => set('state', e.target.value)} /></Field>
        <Field label="PIN code" hint="City and state fill in automatically."><Input value={f.pincode} onChange={(e) => setPin(e.target.value)} maxLength={6} inputMode="numeric" /></Field>
        <span />
        <Field label="Emergency contact name"><Input value={f.ecName} onChange={(e) => set('ecName', e.target.value)} /></Field>
        <Field label="Emergency contact mobile"><Input value={f.ecMobile} onChange={(e) => set('ecMobile', e.target.value)} placeholder="+91…" /></Field>
        <Field label="Medical conditions" hint="Comma separated" className="sm:col-span-2"><Input value={f.conditions} onChange={(e) => set('conditions', e.target.value)} /></Field>
        <Field label="Allergies" hint="Comma separated" className="sm:col-span-2"><Input value={f.allergies} onChange={(e) => set('allergies', e.target.value)} /></Field>
        <Field label="Special instructions" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

/** Remove (archive) a parent. Blocked by the server while upcoming visits exist. */
export function DeleteParentDialog({ parent, invalidate, redirect, onClose }: { parent: { _id: string; fullName: string }; invalidate: unknown[][]; redirect?: string; onClose: () => void }) {
  const router = useRouter();
  const act = useAction(() => del(`/admin/parents/${parent._id}`), { success: `${parent.fullName} removed`, invalidate: invalidate as never, onDone: () => { onClose(); if (redirect) router.push(redirect); } });
  return (
    <Dialog open onClose={onClose} title={`Remove ${parent.fullName}?`} description="They are archived and no longer appear in lists. Past visits and reports are kept. You must cancel upcoming visits and plans first."
      footer={<><Button variant="secondary" onClick={onClose}>Keep</Button><Button variant="danger" onClick={() => act.mutate(undefined)} loading={act.isPending}>Remove parent</Button></>}>
      <p className="text-sm text-ink-muted">This cannot be undone from the admin panel.</p>
    </Dialog>
  );
}
