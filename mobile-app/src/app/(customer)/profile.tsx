import { useState } from 'react';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import type { User } from '@/lib/types';
import { Button, Field, Input, Screen, T } from '@/components/ui';
import { deviceTz } from '@/lib/format';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [mobile, setMobile] = useState(user?.mobile || '');
  const tz = deviceTz();
  const save = useAction(
    () => api.patch<{ user: User }>('/auth/me', { name: name.trim(), mobile: mobile.trim() ? mobile.replace(/[\s-]/g, '') : undefined, timezone: tz }),
    { success: 'Saved', onDone: (r) => { if (r?.user) setUser(r.user); router.back(); } }
  );
  return (
    <Screen footer={<Button title="Save" loading={save.isPending} disabled={name.trim().length < 2} onPress={() => save.mutate()} />}>
      <Field label="Name"><Input value={name} onChangeText={setName} /></Field>
      <Field label="Email" hint="Contact the care team to change your email."><Input value={user?.email} editable={false} /></Field>
      <Field label="Mobile (with country code)"><Input value={mobile} onChangeText={setMobile} keyboardType="phone-pad" /></Field>
      <T v="small">Time zone: {tz} (from this phone)</T>
    </Screen>
  );
}
