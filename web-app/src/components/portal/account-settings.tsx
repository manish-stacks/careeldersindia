'use client';
import { useState } from 'react';
import { get, patch, post, setAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';
import { useAction } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Panel } from '@/components/ui/misc';
import type { User } from '@/lib/types';

/** Name, mobile and password for the signed-in customer or assistant. */
export function AccountSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || '');
  const [mobile, setMobile] = useState(user?.mobile || '');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  const save = useAction(() => patch('/auth/me', { name: name.trim(), ...(mobile.trim() ? { mobile: mobile.trim() } : {}) }), { success: 'Profile updated', onDone: () => get<{ user: User }>('/auth/me') });
  const change = useAction(() => post<{ accessToken: string }>('/auth/change-password', pw), {
    success: 'Password changed',
    onDone: (r) => {
      setAccessToken(r.data.accessToken);
      setPw({ currentPassword: '', newPassword: '' });
      toast.success('You stay signed in on this device');
    },
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Panel title="Profile">
        <div className="space-y-4">
          <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email" hint="Contact the care desk to change your email"><Input value={user?.email || ''} disabled /></Field>
          <Field label="Mobile" hint="Include the country code, for example +919876543210"><Input value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={name.trim().length < 2}>Save changes</Button>
        </div>
      </Panel>
      <Panel title="Change password">
        <div className="space-y-4">
          <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New password" hint="At least 8 characters with a letter and a number"><Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Button onClick={() => change.mutate(undefined)} loading={change.isPending} disabled={!pw.currentPassword || pw.newPassword.length < 8}>Update password</Button>
        </div>
      </Panel>
    </div>
  );
}
