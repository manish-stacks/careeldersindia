import { useState } from 'react';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';
import { S } from '@/lib/theme';
import { Button, Field, Input, Notice, Screen, T } from '@/components/ui';
import { View } from 'react-native';

export default function Forgot() {
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strong = pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        step === 1 ? (
          <Button title="Send code" loading={busy} disabled={identifier.trim().length < 3} onPress={() => run(async () => { await api.public('/auth/forgot-password', { identifier: identifier.trim() }); setStep(2); })} />
        ) : (
          <Button
            title="Set new password"
            loading={busy}
            disabled={otp.length !== 6 || !strong}
            onPress={() => run(async () => { await api.public('/auth/reset-password', { identifier: identifier.trim(), otp, newPassword: pw }); toast('Password updated. Please sign in.'); router.replace('/login'); })}
          />
        )
      }
    >
      {step === 1 ? (
        <>
          <T style={{ marginBottom: S.lg }}>Enter the email or mobile number on your account. We&apos;ll send a 6-digit code.</T>
          <Field label="Email or mobile"><Input value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" /></Field>
        </>
      ) : (
        <>
          <T style={{ marginBottom: S.lg }}>If an account exists for {identifier}, a code is on its way. It expires in 10 minutes.</T>
          <Field label="6-digit code"><Input value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" style={{ fontSize: 24, letterSpacing: 8 }} /></Field>
          <Field label="New password" hint="8+ characters with a letter and a number."><Input value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" /></Field>
        </>
      )}
      {error && <View style={{ marginTop: S.md }}><Notice tone="danger" title={error} /></View>}
    </Screen>
  );
}
