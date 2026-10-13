import { useState } from 'react';
import { router } from 'expo-router';
import { api, saveSession, type Session } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, Field, Input, Screen, T } from '@/components/ui';

export default function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const strong = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);
  const save = useAction(() => api.post<Session>('/auth/change-password', { currentPassword: current, newPassword: next }), {
    success: 'Password changed. Other devices were signed out.',
    onDone: async (s) => {
      await saveSession(s); // rotated session for this phone
      router.back();
    },
  });
  return (
    <Screen footer={<Button title="Change password" loading={save.isPending} disabled={!current || !strong || next !== again} onPress={() => save.mutate()} />}>
      <Field label="Current password"><Input value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" /></Field>
      <Field label="New password" hint="8+ characters with a letter and a number."><Input value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" /></Field>
      <Field label="Repeat new password" error={again && again !== next ? "Passwords don't match" : undefined}><Input value={again} onChangeText={setAgain} secureTextEntry /></Field>
      <T v="small">Changing your password signs you out on all other devices.</T>
    </Screen>
  );
}
