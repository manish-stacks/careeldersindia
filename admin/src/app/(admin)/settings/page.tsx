'use client';
import { useState, type FormEvent } from 'react';
import { ExternalLink } from 'lucide-react';
import { API_URL, post, setAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/lib/socket';
import { useToast } from '@/components/ui/toast';
import { dateTime } from '@/lib/utils';
import { KeyVal, PageHeader, Panel } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

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
