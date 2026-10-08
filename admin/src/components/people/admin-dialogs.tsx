'use client';
import Link from 'next/link';
import { Eye, Trash2 } from 'lucide-react';
import { lookupPincode } from '@/lib/pincode';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { del, get, getPaged, patch, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { FREQUENCIES, countVisits } from '@/components/plans/shared';

type Created = { user: { _id: string; name: string; email: string }; temporaryPassword: string };

/** Add a customer or an assistant. Shows the temporary password once. */
export function AddUserDialog({ role, onClose }: { role: 'CUSTOMER' | 'ASSISTANT'; onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', mobile: '', password: '', loginEnabled: true, country: 'IN', timezone: 'Asia/Kolkata' });
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [done, setDone] = useState<Created | null>(null);
  const services = useQuery({ queryKey: ['services'], queryFn: () => get<{ _id: string; name: string }[]>('/admin/services'), enabled: role === 'ASSISTANT' });
  const body = { name: f.name.trim(), email: f.email.trim(), mobile: f.mobile.trim() || undefined, password: f.password || undefined, loginEnabled: f.loginEnabled, ...(role === 'ASSISTANT' ? { serviceIds } : { country: f.country, timezone: f.timezone }) };
  const save = useAction(() => post<Created>(role === 'CUSTOMER' ? '/admin/customers' : '/admin/assistants', body).then((r) => r.data), {
    success: `${role === 'CUSTOMER' ? 'Customer' : 'Assistant'} created`, invalidate: [['customers'], ['assistants']], onDone: setDone,
  });
  const valid = body.name.length >= 2 && /\S+@\S+\.\S+/.test(body.email) && (!f.password || f.password.length >= 8);
  const label = role === 'CUSTOMER' ? 'customer' : 'assistant';

  if (done) {
    return (
      <Dialog open onClose={onClose} title={`${done.user.name} is ready`} description="Share these sign-in details securely. The password is shown only once." footer={<Button onClick={onClose}>Done</Button>}>
        <div className="space-y-2 rounded-lg border border-line bg-surface-muted p-4 text-sm">
          <p>Email: <b>{done.user.email}</b></p>
          <p>Temporary password: <b className="select-all font-mono">{done.temporaryPassword}</b></p>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog open onClose={onClose} wide title={`Add ${label}`} description="Accounts are created by you; there is no public signup."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid}>Create {label}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email (used to sign in)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Mobile (optional)" hint="With country code, e.g. +15551234567"><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
        <Field label="Password (optional)" hint="Leave empty to generate a temporary one."><Input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {role === 'CUSTOMER' && <CountryTimezoneFields country={f.country} timezone={f.timezone} onChange={(country, timezone) => setF((x) => ({ ...x, country, timezone }))} />}
        {role === 'ASSISTANT' && (
          <Field label="Services this assistant can perform" className="sm:col-span-2">
            <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
              {(services.data || []).map((s) => (
                <Checkbox key={s._id} label={s.name} checked={serviceIds.includes(s._id)} onChange={(v) => setServiceIds(v ? [...serviceIds, s._id] : serviceIds.filter((x) => x !== s._id))} />
              ))}
            </div>
          </Field>
        )}
        <div className="sm:col-span-2"><Checkbox label="Login enabled" description="Untick to create the account but block sign-in until you enable it." checked={f.loginEnabled} onChange={(v) => setF({ ...f, loginEnabled: v })} /></div>
      </div>
    </Dialog>
  );
}

/** Enable / disable sign-in. Disabling signs the user out everywhere. */
export function LoginToggleButton({ userId, enabled, invalidate }: { userId: string; enabled: boolean; invalidate: unknown[][] }) {
  const act = useAction(() => patch(`/admin/users/${userId}/login`, { enabled: !enabled }), { success: enabled ? 'Login disabled — signed out everywhere' : 'Login enabled', invalidate: invalidate as never });
  return <Button variant={enabled ? 'secondary' : 'primary'} loading={act.isPending} onClick={() => act.mutate(undefined)}>{enabled ? 'Disable login' : 'Enable login'}</Button>;
}

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [pw, setPw] = useState<string | null>(null);
  const act = useAction(() => post<{ temporaryPassword: string }>(`/admin/users/${userId}/reset-password`).then((r) => r.data), { onDone: (r) => setPw(r.temporaryPassword) });
  return (
    <>
      <Button variant="secondary" loading={act.isPending} onClick={() => act.mutate(undefined)}>Reset password</Button>
      {pw && <Dialog open onClose={() => setPw(null)} title="Temporary password" description="Shown only once. The user is signed out everywhere." footer={<Button onClick={() => setPw(null)}>Done</Button>}><p className="select-all font-mono text-lg font-bold">{pw}</p></Dialog>}
    </>
  );
}

/** Add the person being cared for (e.g. "Mom") to a customer's account. */
export function AddParentDialog({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const [f, setF] = useState({ fullName: '', gender: 'FEMALE', dateOfBirth: '', relationToOwner: 'Mother', mobile: '', line1: '', city: '', state: '', pincode: '', ecName: '', ecMobile: '' });
  const setPin = async (v: string) => {
    set('pincode', v);
    const r = await lookupPincode(v.trim()); // fills city and state automatically
    if (r) setF((s) => ({ ...s, pincode: v, city: r.city, state: r.state }));
  };
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const body = {
    fullName: f.fullName.trim(), gender: f.gender, dateOfBirth: f.dateOfBirth, relationToOwner: f.relationToOwner.trim() || undefined, mobile: f.mobile.trim(),
    address: { line1: f.line1.trim(), city: f.city.trim(), state: f.state.trim(), pincode: f.pincode.trim() },
    emergencyContacts: [{ name: f.ecName.trim(), mobile: f.ecMobile.trim() }],
  };
  const save = useAction(() => post(`/admin/customers/${customerId}/parents`, body), { success: 'Parent added', invalidate: [['customer', customerId]], onDone: onClose });
  const valid = body.fullName.length >= 2 && f.dateOfBirth && body.address.line1.length >= 3 && body.address.city && body.address.state && body.address.pincode && body.mobile.length >= 8 && body.emergencyContacts[0].name.length >= 2 && body.emergencyContacts[0].mobile;
  return (
    <Dialog open onClose={onClose} wide title="Add parent / patient" description="The home address is where the assistant will visit."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid}>Add</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} /></Field>
        <Field label="Relation to customer"><Input value={f.relationToOwner} onChange={(e) => set('relationToOwner', e.target.value)} /></Field>
        <Field label="Gender"><Select value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></Select></Field>
        <Field label="Date of birth"><Input type="date" value={f.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></Field>
        <Field label="Patient mobile" hint="The assistant calls this number."><Input value={f.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="+91…" /></Field>
        <Field label="PIN code" hint="City and state fill in automatically."><Input value={f.pincode} onChange={(e) => setPin(e.target.value)} maxLength={6} inputMode="numeric" /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.line1} onChange={(e) => set('line1', e.target.value)} /></Field>
        <Field label="City"><Input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="State"><Input value={f.state} onChange={(e) => set('state', e.target.value)} /></Field>
        <Field label="Emergency contact name"><Input value={f.ecName} onChange={(e) => set('ecName', e.target.value)} /></Field>
        <Field label="Emergency contact mobile"><Input value={f.ecMobile} onChange={(e) => set('ecMobile', e.target.value)} placeholder="+91…" /></Field>
      </div>
    </Dialog>
  );
}

type Opt = { _id: string; name: string };
/** Sell a (daily) plan to a customer and optionally pin one assistant to every visit. */
export function CreatePlanDialog({ customerId, parents, onClose }: { customerId: string; parents: { _id: string; fullName: string }[]; onClose: () => void }) {
  const [f, setF] = useState({ parentId: parents[0]?._id || '', assistantId: '', startDate: '', endDate: '', time: '09:00', frequency: 'DAILY', intervalDays: '2' });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const services = useQuery({ queryKey: ['services'], queryFn: () => get<(Opt & { isActive: boolean; sheetKind?: string; items?: { key: string; label: string }[] })[]>('/admin/services') });
  // serviceId -> ticked item keys (a service is part of the plan when it has an entry)
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const toggleService = (s: { _id: string; items?: { key: string }[] }) => setPicked((p) => { const n = { ...p }; if (n[s._id]) delete n[s._id]; else n[s._id] = (s.items || []).map((i) => i.key); return n; });
  const toggleItem = (id: string, key: string) => setPicked((p) => ({ ...p, [id]: p[id].includes(key) ? p[id].filter((k) => k !== key) : [...p[id], key] }));
  const sheets = Object.entries(picked).map(([serviceId, itemKeys]) => ({ serviceId, itemKeys }));
  const assistants = useQuery({ queryKey: ['assistants', 'approved-all'], queryFn: () => getPaged<{ userId: Opt }>('/admin/assistants?verificationStatus=APPROVED&limit=100') });
  const visits = countVisits(f.startDate, f.endDate, f.frequency, Number(f.intervalDays));
  const body = { customerId, parentId: f.parentId, sheets, assistantId: f.assistantId || undefined, frequency: f.frequency, intervalDays: f.frequency === 'CUSTOM' ? Number(f.intervalDays) : undefined, startDate: f.startDate, endDate: f.endDate, time: f.time };
  const save = useAction(() => post('/admin/plans', body), { success: 'Plan created — visits are scheduled', invalidate: [['customer', customerId], ['plans']], onDone: onClose });
  const valid = f.parentId && sheets.length > 0 && sheets.every((x) => x.itemKeys.length > 0 || !services.data?.find((s) => s._id === x.serviceId)?.items?.length) && f.startDate && f.endDate >= f.startDate && /^\d{2}:\d{2}$/.test(f.time) && visits >= 1;
  return (
    <Dialog open onClose={onClose} wide title="Create plan" description="Choose the plan period and how often the assistant visits. Visit times are in the parent's local time zone."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid}>Create plan</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Parent / patient"><Select value={f.parentId} onChange={(e) => set('parentId', e.target.value)}>{parents.map((p) => <option key={p._id} value={p._id}>{p.fullName}</option>)}</Select></Field>
        <Field label="Assistant for all visits" hint="Optional. Auto-assigned to every visit."><Select value={f.assistantId} onChange={(e) => set('assistantId', e.target.value)}><option value="">Assign later</option>{(assistants.data?.items || []).map((a) => <option key={a.userId._id} value={a.userId._id}>{a.userId.name}</option>)}</Select></Field>
        <Field label="Plan starts on"><Input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Plan ends on"><Input type="date" min={f.startDate} value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Visit frequency"><Select value={f.frequency} onChange={(e) => set('frequency', e.target.value)}>{FREQUENCIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select></Field>
        {f.frequency === 'CUSTOM' ? <Field label="Days between visits"><Input type="number" min={1} max={90} value={f.intervalDays} onChange={(e) => set('intervalDays', e.target.value)} /></Field> : <span />}
        <Field label="Visit time"><Input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} /></Field>
        <p className="self-end rounded-lg bg-canvas px-4 py-2.5 text-sm"><b>{visits}</b> visit{visits === 1 ? '' : 's'} will be scheduled</p>
        <div className="sm:col-span-2">
          <p className="mb-1 text-sm font-semibold">Services for this client</p>
          <p className="mb-2 text-sm text-ink-muted">Tick a service, then tick the child items that apply. The visiting assistant sees only the ticked items.</p>
          <div className="space-y-3">
            {(services.data || []).map((s) => (
              <div key={s._id} className="rounded-lg border border-line p-3">
                <Checkbox label={s.name} checked={!!picked[s._id]} onChange={() => toggleService(s)} />
                {picked[s._id] && !!s.items?.length && (
                  <div className="mt-2 grid gap-x-4 gap-y-1 pl-6 sm:grid-cols-2">
                    <div className="sm:col-span-2 flex gap-3 text-sm">
                      <button type="button" className="text-brand underline" onClick={() => setPicked((p) => ({ ...p, [s._id]: s.items!.map((i) => i.key) }))}>Select all</button>
                      <button type="button" className="text-brand underline" onClick={() => setPicked((p) => ({ ...p, [s._id]: [] }))}>Clear</button>
                    </div>
                    {s.items.map((i) => <Checkbox key={i.key} label={i.label} checked={picked[s._id].includes(i.key)} onChange={() => toggleItem(s._id, i.key)} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** View + Delete buttons used at the end of customer / assistant table rows. */
export function RowActions({ href, name, userId, role }: { href: string; name: string; userId: string; role: 'CUSTOMER' | 'ASSISTANT' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
      <Link href={href} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-canvas"><Eye className="h-4 w-4" />View</Link>
      <Button size="sm" variant="danger" aria-label={`Delete ${name}`} onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" />Delete</Button>
      {open && <DeleteUserDialog name={name} userId={userId} role={role} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function DeleteUserDialog({ name, userId, role, onClose }: { name: string; userId: string; role: 'CUSTOMER' | 'ASSISTANT'; onClose: () => void }) {
  const label = role === 'CUSTOMER' ? 'customer' : 'assistant';
  const [force, setForce] = useState(role === 'CUSTOMER');
  const act = useAction(() => del(`/admin/${role === 'CUSTOMER' ? 'customers' : 'assistants'}/${userId}${force ? '?force=true' : ''}`), { success: `${name} deleted`, invalidate: [['customers'], ['assistants'], ['assistant-workload'], ['dashboard']], onDone: onClose });
  return (
    <Dialog open onClose={onClose} title={`Delete ${name}?`} description={`The ${label} can no longer sign in and disappears from lists. Past visits, reports and payments are kept. Upcoming visits${role === 'CUSTOMER' ? ' and active plans' : ''} must be cancelled${role === 'ASSISTANT' ? ' or reassigned' : ''} first.`}
      footer={<><Button variant="secondary" onClick={onClose}>Keep</Button><Button variant="danger" onClick={() => act.mutate(undefined)} loading={act.isPending}>Delete {label}</Button></>}>
      {role === 'CUSTOMER' && <Checkbox label="Also cancel all upcoming visits and active plans" description="Cancels everything in one step; paid visits are refunded per the cancellation policy. Untick to be blocked instead if anything is still open." checked={force} onChange={setForce} />}
      <p className="mt-3 text-sm text-ink-muted">This cannot be undone from the admin panel.</p>
    </Dialog>
  );
}

const COUNTRIES: [string, string, string][] = [['IN', 'India', 'Asia/Kolkata'], ['US', 'United States', 'America/New_York'], ['GB', 'United Kingdom', 'Europe/London'], ['CA', 'Canada', 'America/Toronto'], ['AU', 'Australia', 'Australia/Sydney'], ['AE', 'UAE', 'Asia/Dubai'], ['SG', 'Singapore', 'Asia/Singapore'], ['DE', 'Germany', 'Europe/Berlin'], ['NZ', 'New Zealand', 'Pacific/Auckland'], ['SA', 'Saudi Arabia', 'Asia/Riyadh'], ['QA', 'Qatar', 'Asia/Qatar'], ['KW', 'Kuwait', 'Asia/Kuwait']];
/** Country + time zone pickers for the customer's own location (visit reminders use it). */
export function CountryTimezoneFields({ country, timezone, onChange }: { country: string; timezone: string; onChange: (country: string, timezone: string) => void }) {
  const zones = (typeof Intl !== 'undefined' && (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone')) || COUNTRIES.map((c) => c[2]);
  return (
    <>
      <Field label="Country"><Select value={country} onChange={(e) => { const c = COUNTRIES.find((x) => x[0] === e.target.value); onChange(e.target.value, c ? c[2] : timezone); }}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</Select></Field>
      <Field label="Time zone"><Select value={timezone} onChange={(e) => onChange(country, e.target.value)}>{(zones.includes(timezone) ? zones : [timezone, ...zones]).map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
    </>
  );
}
