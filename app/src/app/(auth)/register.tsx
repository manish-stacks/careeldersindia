import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { deviceTz } from '@/lib/format';
import { S } from '@/lib/theme';
import { Button, Chip, Field, Input, Notice, Screen, T } from '@/components/ui';

const COUNTRIES = [
  ['US', 'USA'], ['GB', 'UK'], ['CA', 'Canada'], ['AU', 'Australia'], ['AE', 'UAE'], ['SG', 'Singapore'], ['DE', 'Germany'], ['IN', 'India'],
] as const;

export default function Register() {
  const { signUp } = useAuth();
  const tz = useMemo(deviceTz, []);
  const [f, setF] = useState({ name: '', email: '', mobile: '', password: '', country: tz.startsWith('America') ? 'US' : tz === 'Europe/London' ? 'GB' : 'IN' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const strong = f.password.length >= 8 && /[A-Za-z]/.test(f.password) && /\d/.test(f.password);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await signUp('/auth/register', {
        name: f.name.trim(),
        email: f.email.trim(),
        mobile: f.mobile.trim() ? f.mobile.replace(/[\s-]/g, '') : undefined,
        password: f.password,
        country: f.country,
        timezone: tz,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen footer={<Button title="Create account" onPress={submit} loading={busy} disabled={f.name.trim().length < 2 || !f.email.includes('@') || !strong} />}>
      <T v="small" style={{ marginBottom: S.lg }}>
        Book home health visits for your parents and see every report, wherever you live.
      </T>
      <Field label="Your full name" required>
        <Input value={f.name} onChangeText={set('name')} autoComplete="name" textContentType="name" />
      </Field>
      <Field label="Email" required>
        <Input value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      </Field>
      <Field label="Mobile (with country code)" hint="e.g. +1 415 555 0100. Used by our care team in emergencies.">
        <Input value={f.mobile} onChangeText={set('mobile')} keyboardType="phone-pad" autoComplete="tel" placeholder="+1…" />
      </Field>
      <Field label="Where do you live?">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
          {COUNTRIES.map(([code, name]) => (
            <Chip key={code} label={name} selected={f.country === code} onPress={() => set('country')(code)} />
          ))}
        </View>
      </Field>
      <Field label="Password" required hint="At least 8 characters with a letter and a number." error={f.password && !strong ? 'Add a letter and a number, 8+ characters' : undefined}>
        <Input value={f.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      </Field>
      <T v="caption">Times in the app are shown in India time with your local time ({tz}) alongside.</T>
      {error && <View style={{ marginTop: S.lg }}><Notice tone="danger" title={error} /></View>}
    </Screen>
  );
}
