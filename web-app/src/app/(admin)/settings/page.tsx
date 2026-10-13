'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink } from 'lucide-react';
import { API_URL, get, post, put, setAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/lib/socket';
import { useToast } from '@/components/ui/toast';
import { dateTime } from '@/lib/utils';
import { KeyVal, PageHeader, Panel } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';

type Contact = { email: string; phone: string; whatsapp: string; website: string; hours: string; address: string; facebook: string; instagram: string; linkedin: string; youtube: string };
const EMPTY: Contact = { email: '', phone: '', whatsapp: '', website: '', hours: '', address: '', facebook: '', instagram: '', linkedin: '', youtube: '' };

function ContactPanel() {
  const toast = useToast();
  const [c, setC] = useState<Contact>(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get<Contact>('/admin/settings/contact').then((d) => setC({ ...EMPTY, ...d })).catch(() => {}); }, []);
  const set = (k: keyof Contact) => (e: { target: { value: string } }) => setC((p) => ({ ...p, [k]: e.target.value }));
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await put('/admin/settings/contact', c); toast.success('Contact details saved', 'The website and the mobile app show these details right away.'); }
    catch (err) { toast.error('Could not save', err instanceof Error ? err.message : undefined); }
    finally { setBusy(false); }
  }
  return (
    <Panel title="Contact details" className="lg:col-span-2">
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field label="Support email"><Input type="email" value={c.email} onChange={set('email')} placeholder="support@careeldersindia.com" /></Field>
        <Field label="Support phone"><Input value={c.phone} onChange={set('phone')} placeholder="+91 98XXXXXXXX" /></Field>
        <Field label="WhatsApp number"><Input value={c.whatsapp} onChange={set('whatsapp')} placeholder="+91 98XXXXXXXX" /></Field>
        <Field label="Website"><Input value={c.website} onChange={set('website')} placeholder="https://careeldersindia.com" /></Field>
        <Field label="Working hours"><Input value={c.hours} onChange={set('hours')} placeholder="Mon–Sat, 9 am – 7 pm" /></Field>
        <Field label="Office address"><Input value={c.address} onChange={set('address')} /></Field>
        <Field label="Facebook page URL"><Input value={c.facebook} onChange={set('facebook')} placeholder="https://facebook.com/..." /></Field>
        <Field label="Instagram URL"><Input value={c.instagram} onChange={set('instagram')} placeholder="https://instagram.com/..." /></Field>
        <Field label="LinkedIn URL"><Input value={c.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/company/..." /></Field>
        <Field label="YouTube URL"><Input value={c.youtube} onChange={set('youtube')} placeholder="https://youtube.com/@..." /></Field>
        <div className="flex justify-end md:col-span-2"><Button type="submit" loading={busy}>Save contact details</Button></div>
      </form>
    </Panel>
  );
}

function LegalPanel() {
  const toast = useToast();
  const [d, setD] = useState({ privacy: '', terms: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { get<typeof d>('/admin/settings/legal').then(setD).catch(() => {}); }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await put('/admin/settings/legal', d); toast.success('Saved', 'The website pages are updated.'); }
    catch (err) { toast.error('Could not save', err instanceof Error ? err.message : undefined); }
    finally { setBusy(false); }
  }
  return (
    <Panel title="Privacy Policy and Terms" className="lg:col-span-2">
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field label="Privacy Policy" hint="Start a line with # to make a heading. Leave a blank line between paragraphs."><Textarea rows={14} value={d.privacy} onChange={(e) => setD({ ...d, privacy: e.target.value })} /></Field>
        <Field label="Terms and Conditions" hint="Start a line with # to make a heading. Leave a blank line between paragraphs."><Textarea rows={14} value={d.terms} onChange={(e) => setD({ ...d, terms: e.target.value })} /></Field>
        <div className="flex justify-end md:col-span-2"><Button type="submit" loading={busy}>Save pages</Button></div>
      </form>
    </Panel>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { connected } = useSocket();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const strong = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);
  async function change(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next !== again) return setErr('The new passwords do not match.');
    setBusy(true);
    try {
      const r = await post<{ accessToken: string }>('/auth/change-password', { currentPassword: current, newPassword: next });
      setAccessToken(r.data.accessToken);
      toast.success('Password changed', 'Other devices have been signed out.');
      setCurrent(''); setNext(''); setAgain('');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Your account">
          <KeyVal cols={1} items={[['Name', user?.name], ['Email', user?.email], ['Mobile', user?.mobile], ['Role', 'Administrator'], ['Last sign-in', dateTime(user?.lastLoginAt)]]} />
        </Panel>
        <Panel title="Change password">
          <form onSubmit={change} className="space-y-4">
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
            <Field label="New password" hint="At least 8 characters with a letter and a number."><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
            <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
            {err && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
            <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!current || !strong || !again}>Change password</Button></div>
          </form>
        </Panel>
        <ContactPanel />
        <LegalPanel />
        <Panel title="System" className="lg:col-span-2">
          <KeyVal cols={3} items={[
            ['API', API_URL],
            ['Live updates', connected ? 'Connected' : 'Disconnected'],
            ['Operating time zone', 'Asia/Kolkata (IST)'],
          ]} />
          <div className="mt-4 flex flex-wrap gap-4 text-[15px]">
            <a className="link inline-flex items-center gap-1" href={`${API_URL}/api-docs`} target="_blank" rel="noreferrer">API documentation <ExternalLink className="h-3.5 w-3.5" /></a>
            <a className="link inline-flex items-center gap-1" href={`${API_URL}/health`} target="_blank" rel="noreferrer">Health check <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
          <p className="mt-4 text-sm text-ink-muted">Payment keys, push credentials and SMS settings live in the server environment, not here, so they never reach the browser.</p>
        </Panel>
      </div>
    </>
  );
}
