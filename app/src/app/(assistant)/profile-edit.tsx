import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { S } from '@/lib/theme';
import type { AssistantProfile, User } from '@/lib/types';
import { Button, Card, ErrorView, Field, Input, Loading, Screen, T } from '@/components/ui';
import { TagInput } from '@/components/inputs';

export default function ProfileEdit() {
  const q = useQuery({ queryKey: ['assistant-profile'], queryFn: () => api.get<{ user: User; profile: AssistantProfile }>('/assistant/profile') });
  const [f, setF] = useState({ name: '', qualification: '', experience: '', accountHolder: '', accountNumber: '', ifsc: '', upiId: '', pan: '' });
  const [languages, setLanguages] = useState<string[]>([]);
  const [areas, setAreas] = useState<{ city: string; pincodes: string }[]>([]);
  useEffect(() => {
    if (!q.data) return;
    const p = q.data.profile;
    setF((x) => ({ ...x, name: q.data!.user.name, qualification: p.qualification || '', experience: String(p.experienceYears ?? ''), accountHolder: p.bank?.accountHolder || '', ifsc: p.bank?.ifsc || '', upiId: p.bank?.upiId || '' }));
    setLanguages(p.languages || []);
    setAreas(p.serviceAreas.length ? p.serviceAreas.map((a) => ({ city: a.city, pincodes: a.pincodes.join(', ') })) : [{ city: '', pincodes: '' }]);
  }, [q.data]);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const ifscOk = !f.ifsc || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc.toUpperCase());
  const accOk = !f.accountNumber || /^\d{9,18}$/.test(f.accountNumber);
  const panOk = !f.pan || /^[A-Z]{5}\d{4}[A-Z]$/.test(f.pan.toUpperCase());

  const save = useAction(
    () => {
      const bank: Record<string, string> = {};
      if (f.accountHolder.trim()) bank.accountHolder = f.accountHolder.trim();
      if (f.accountNumber) bank.accountNumber = f.accountNumber;
      if (f.ifsc) bank.ifsc = f.ifsc.toUpperCase();
      if (f.upiId.trim()) bank.upiId = f.upiId.trim();
      return api.patch('/assistant/profile', {
        name: f.name.trim(),
        qualification: f.qualification.trim() || undefined,
        experienceYears: Number(f.experience) || 0,
        languages,
        serviceAreas: areas.filter((a) => a.city.trim()).map((a) => ({ city: a.city.trim(), pincodes: a.pincodes.split(/[,\s]+/).filter((p) => /^[1-9]\d{5}$/.test(p)) })),
        ...(Object.keys(bank).length ? { bank } : {}),
        ...(f.pan ? { panNumber: f.pan.toUpperCase() } : {}),
      });
    },
    { success: 'Profile saved', invalidate: [['assistant-profile']], onDone: () => router.back() }
  );

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const bank = q.data.profile.bank;

  return (
    <Screen footer={<Button title="Save" loading={save.isPending} disabled={f.name.trim().length < 2 || !ifscOk || !accOk || !panOk} onPress={() => save.mutate()} />}>
      <Field label="Name"><Input value={f.name} onChangeText={set('name')} /></Field>
      <Field label="Qualification"><Input value={f.qualification} onChangeText={set('qualification')} /></Field>
      <Field label="Years of experience"><Input value={f.experience} onChangeText={set('experience')} keyboardType="number-pad" maxLength={2} /></Field>
      <Field label="Languages"><TagInput values={languages} onChange={setLanguages} placeholder="Add a language" suggestions={['Hindi', 'English', 'Punjabi', 'Tamil', 'Malayalam', 'Bengali', 'Marathi', 'Telugu']} /></Field>

      <T v="heading" style={{ marginTop: S.md, marginBottom: S.sm }}>Where you take visits</T>
      {areas.map((a, i) => (
        <Card key={i} style={{ marginBottom: S.sm }}>
          <Field label="City"><Input value={a.city} onChangeText={(t) => setAreas(areas.map((x, j) => (j === i ? { ...x, city: t } : x)))} /></Field>
          <Field label="PIN codes (optional)" hint="Comma separated. Empty = whole city." style={{ marginBottom: 0 }}><Input value={a.pincodes} keyboardType="numbers-and-punctuation" onChangeText={(t) => setAreas(areas.map((x, j) => (j === i ? { ...x, pincodes: t } : x)))} /></Field>
        </Card>
      ))}
      {areas.length < 5 && <Button title="Add another city" icon="add" variant="secondary" size="md" onPress={() => setAreas([...areas, { city: '', pincodes: '' }])} />}

      <T v="heading" style={{ marginTop: S.xl, marginBottom: S.xs }}>Payout details</T>
      <T v="small" style={{ marginBottom: S.md }}>Encrypted on our servers. {bank?.accountLast4 ? `Current account ends ${bank.accountLast4}.` : ''}</T>
      <Field label="Account holder name"><Input value={f.accountHolder} onChangeText={set('accountHolder')} /></Field>
      <View style={{ flexDirection: 'row', gap: S.sm }}>
        <Field label="Account number" style={{ flex: 1.4 }} error={accOk ? undefined : '9–18 digits'}><Input value={f.accountNumber} onChangeText={(t) => set('accountNumber')(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={bank?.accountLast4 ? `••••${bank.accountLast4}` : ''} secureTextEntry /></Field>
        <Field label="IFSC" style={{ flex: 1 }} error={ifscOk ? undefined : 'Invalid'}><Input value={f.ifsc} onChangeText={set('ifsc')} autoCapitalize="characters" maxLength={11} /></Field>
      </View>
      <Field label="UPI ID (optional)"><Input value={f.upiId} onChangeText={set('upiId')} autoCapitalize="none" /></Field>
      <Field label="PAN" error={panOk ? undefined : 'Format ABCDE1234F'} hint={q.data.profile.pan?.last4 ? `Saved, ending ${q.data.profile.pan.last4}` : undefined}><Input value={f.pan} onChangeText={set('pan')} autoCapitalize="characters" maxLength={10} /></Field>
    </Screen>
  );
}
