'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, http, patch } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useToast } from '@/components/ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';

export type AssistantProfile = {
  gender?: string; dateOfBirth?: string; qualification?: string; experienceYears: number; languages: string[];
  address?: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string };
  serviceAreas: { city: string; pincodes: string[] }[]; serviceIds: { _id: string; name: string }[];
  bank?: { accountHolder?: string; accountLast4?: string; ifsc?: string; upiId?: string }; pan?: { last4?: string };
  userId: { _id: string; name: string; email: string; mobile?: string };
};
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** Admin can change everything about an assistant. Blank bank account / PAN keeps the stored (encrypted) value. */
export function EditAssistantDialog({ profile, onClose }: { profile: AssistantProfile; onClose: () => void }) {
  const u = profile.userId;
  const [f, setF] = useState({
    name: u.name, email: u.email, mobile: u.mobile || '', gender: profile.gender || '', dob: (profile.dateOfBirth || '').slice(0, 10), qualification: profile.qualification || '', experience: String(profile.experienceYears ?? 0),
    languages: profile.languages.join(', '), line1: profile.address?.line1 || '', line2: profile.address?.line2 || '', city: profile.address?.city || '', state: profile.address?.state || '', pincode: profile.address?.pincode || '',
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const body = {
    name: f.name.trim(), email: f.email.trim(), mobile: f.mobile.trim() || undefined, gender: f.gender || undefined, dateOfBirth: f.dob || undefined, qualification: f.qualification.trim() || undefined,
    experienceYears: Number(f.experience) || 0, languages: csv(f.languages), address: { line1: f.line1.trim(), line2: f.line2.trim(), city: f.city.trim(), state: f.state.trim(), pincode: f.pincode.trim() },
  };
  const save = useAction(() => patch(`/admin/assistants/${u._id}`, body), { success: 'Assistant updated', invalidate: [['assistant', u._id], ['assistants']], onDone: onClose });
  const valid = body.name.length >= 2 && /\S+@\S+\.\S+/.test(body.email);
  return (
    <Dialog open onClose={onClose} wide title={`Edit ${u.name}`} description="Personal details and sign-in identity. Service areas, working hours and payout details have their own Edit buttons."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid}>Save changes</Button></>}>
      <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Email (sign-in)"><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Mobile"><Input value={f.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="+91…" /></Field>
        <Field label="Gender"><Select value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">—</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></Select></Field>
        <Field label="Date of birth"><Input type="date" value={f.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
        <Field label="Experience (years)"><Input type="number" min={0} max={60} value={f.experience} onChange={(e) => set('experience', e.target.value)} /></Field>
        <Field label="Qualification" className="sm:col-span-2"><Input value={f.qualification} onChange={(e) => set('qualification', e.target.value)} /></Field>
        <Field label="Languages" hint="Comma separated" className="sm:col-span-2"><Input value={f.languages} onChange={(e) => set('languages', e.target.value)} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.line1} onChange={(e) => set('line1', e.target.value)} /></Field>
        <Field label="City"><Input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="State"><Input value={f.state} onChange={(e) => set('state', e.target.value)} /></Field>
        <Field label="PIN code"><Input value={f.pincode} onChange={(e) => set('pincode', e.target.value)} /></Field>
        <span />
      </div>
    </Dialog>
  );
}

const DOC_TYPES = [['GOV_ID', 'Government ID'], ['PAN', 'PAN card'], ['QUALIFICATION', 'Qualification certificate'], ['PROFILE_PHOTO', 'Profile photo'], ['OTHER', 'Other']];
/** Upload a document on the assistant's behalf (accepted automatically). */
export function UploadDocumentDialog({ assistantId, onClose }: { assistantId: string; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState('GOV_ID');
  const [number, setNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('type', type);
      if (number.trim()) form.append('documentNumber', number.trim());
      form.append('file', file);
      await http.post(`/admin/assistants/${assistantId}/documents`, form);
      toast.success('Document uploaded');
      qc.invalidateQueries({ queryKey: ['assistant', assistantId] });
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message || (e as Error).message;
      toast.error('Upload failed', msg);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onClose={onClose} title="Upload document" description="JPG, PNG or PDF. Admin uploads are marked as accepted."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!file || (number.trim().length > 0 && number.trim().length < 4)}>Upload</Button></>}>
      <div className="grid gap-4">
        <Field label="Document type"><Select value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Document number (optional)" hint="Stored encrypted; only the last 4 digits are shown"><Input value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
        <Field label="File"><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="control" /></Field>
      </div>
    </Dialog>
  );
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type Hours = { day: number; start: string; end: string }[];
/** Where (service areas, services) and when (working hours, availability) the assistant can work. */
export function WhereWhenDialog({ profile, onClose }: { profile: AssistantProfile & { workingHours: Hours; isAvailable: boolean }; onClose: () => void }) {
  const u = profile.userId;
  const [areas, setAreas] = useState(profile.serviceAreas.map((a) => `${a.city}${a.pincodes.length ? `: ${a.pincodes.join(', ')}` : ''}`).join('\n'));
  const [serviceIds, setServiceIds] = useState<string[]>(profile.serviceIds.map((s) => s._id));
  const [available, setAvailable] = useState(profile.isAvailable);
  const [hours, setHours] = useState<Record<number, { on: boolean; start: string; end: string }>>(Object.fromEntries(DAY.map((_, i) => { const w = profile.workingHours.find((x) => x.day === i); return [i, { on: !!w, start: w?.start || '09:00', end: w?.end || '18:00' }]; })));
  const services = useQuery({ queryKey: ['services'], queryFn: () => get<{ _id: string; name: string }[]>('/admin/services') });
  const setDay = (i: number, patchV: Partial<{ on: boolean; start: string; end: string }>) => setHours((h) => ({ ...h, [i]: { ...h[i], ...patchV } }));
  const serviceAreas = areas.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [city, pins = ''] = l.split(':'); return { city: city.trim(), pincodes: csv(pins) }; });
  const workingHours = DAY.map((_, i) => i).filter((i) => hours[i].on).map((i) => ({ day: i, start: hours[i].start, end: hours[i].end }));
  const save = useAction(() => patch(`/admin/assistants/${u._id}`, { serviceAreas, serviceIds, workingHours, isAvailable: available }), { success: 'Areas and hours updated', invalidate: [['assistant', u._id], ['assistants']], onDone: onClose });
  const bad = workingHours.some((w) => !/^\d{2}:\d{2}$/.test(w.start) || !/^\d{2}:\d{2}$/.test(w.end) || w.end <= w.start) || serviceAreas.some((a) => a.city.length < 2);
  return (
    <Dialog open onClose={onClose} wide title="Where and when" description="Where this assistant can be sent, which services, and the weekly working hours (IST)."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={bad}>Save</Button></>}>
      <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
        <Field label="Service areas" hint="One per line: City: pin1, pin2 (no pins = whole city)"><Textarea rows={3} value={areas} onChange={(e) => setAreas(e.target.value)} /></Field>
        <Field label="Services this assistant can perform" hint="None ticked = all services">
          <div className="grid max-h-36 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
            {(services.data || []).map((s) => <Checkbox key={s._id} label={s.name} checked={serviceIds.includes(s._id)} onChange={(v) => setServiceIds(v ? [...serviceIds, s._id] : serviceIds.filter((x) => x !== s._id))} />)}
          </div>
        </Field>
        <Field label="Working hours" hint="Untick a day for a day off. End must be after start.">
          <div className="space-y-2">
            {DAY.map((d, i) => (
              <div key={d} className="flex items-center gap-3">
                <span className="w-28"><Checkbox label={d} checked={hours[i].on} onChange={(v) => setDay(i, { on: v })} /></span>
                <Input type="time" disabled={!hours[i].on} className="w-36" value={hours[i].start} onChange={(e) => setDay(i, { start: e.target.value })} />
                <span className="text-ink-muted">to</span>
                <Input type="time" disabled={!hours[i].on} className="w-36" value={hours[i].end} onChange={(e) => setDay(i, { end: e.target.value })} />
              </div>
            ))}
          </div>
        </Field>
        <Checkbox label="Available for new visits" description="Untick to stop assigning visits without deleting the account." checked={available} onChange={setAvailable} />
      </div>
    </Dialog>
  );
}

/** Bank / UPI / PAN used for payouts. Empty account number or PAN keeps the stored encrypted value. */
export function PayoutDialog({ profile, onClose }: { profile: AssistantProfile; onClose: () => void }) {
  const u = profile.userId;
  const [f, setF] = useState({ holder: profile.bank?.accountHolder || '', account: '', ifsc: profile.bank?.ifsc || '', upi: profile.bank?.upiId || '', pan: '' });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const body = { bank: { accountHolder: f.holder.trim() || undefined, accountNumber: f.account.trim() || undefined, ifsc: f.ifsc.trim().toUpperCase() || undefined, upiId: f.upi.trim() || undefined }, panNumber: f.pan.trim().toUpperCase() || undefined };
  const save = useAction(() => patch(`/admin/assistants/${u._id}`, body), { success: 'Payout details updated', invalidate: [['assistant', u._id]], onDone: onClose });
  const bad = (f.account && !/^\d{9,18}$/.test(f.account.trim())) || (f.ifsc && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(f.ifsc.trim())) || (f.pan && !/^[A-Za-z]{5}\d{4}[A-Za-z]$/.test(f.pan.trim()));
  return (
    <Dialog open onClose={onClose} title="Payout details" description="Account number and PAN are stored encrypted; only the last 4 digits are ever shown."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!!bad}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account holder" className="sm:col-span-2"><Input value={f.holder} onChange={(e) => set('holder', e.target.value)} /></Field>
        <Field label="Account number" hint={profile.bank?.accountLast4 ? `Stored: •••• ${profile.bank.accountLast4}` : '9–18 digits'}><Input inputMode="numeric" value={f.account} onChange={(e) => set('account', e.target.value)} placeholder="Leave empty to keep" /></Field>
        <Field label="IFSC" hint="e.g. HDFC0001234"><Input value={f.ifsc} onChange={(e) => set('ifsc', e.target.value)} /></Field>
        <Field label="UPI ID"><Input value={f.upi} onChange={(e) => set('upi', e.target.value)} placeholder="name@bank" /></Field>
        <Field label="PAN" hint={profile.pan?.last4 ? `Stored: •••••••${profile.pan.last4}` : 'e.g. ABCDE1234F'}><Input value={f.pan} onChange={(e) => set('pan', e.target.value)} placeholder="Leave empty to keep" /></Field>
      </div>
    </Dialog>
  );
}
