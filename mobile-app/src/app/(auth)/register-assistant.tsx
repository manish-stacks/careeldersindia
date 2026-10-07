import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { S } from '@/lib/theme';
import { Button, Choice, Field, Input, Notice, Screen, T } from '@/components/ui';
import { DateInput, TagInput } from '@/components/inputs';

export default function RegisterAssistant() {
  const { signUp } = useAuth();
  const [f, setF] = useState({ name: '', email: '', mobile: '+91', password: '', gender: '' as '' | 'MALE' | 'FEMALE' | 'OTHER', dob: '', line1: '', city: '', state: '', pincode: '', qualification: '', experience: '', workCity: '', pincodes: '' });
  const [languages, setLanguages] = useState<string[]>(['Hindi', 'English']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const strong = f.password.length >= 8 && /[A-Za-z]/.test(f.password) && /\d/.test(f.password);
  const valid = f.name.trim().length >= 2 && f.email.includes('@') && f.mobile.length >= 10 && strong && f.gender && f.dob && f.line1 && f.city && f.state && /^[1-9]\d{5}$/.test(f.pincode) && f.workCity.trim();

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await signUp('/auth/register/assistant', {
        name: f.name.trim(),
        email: f.email.trim(),
        mobile: f.mobile.replace(/[\s-]/g, ''),
        password: f.password,
        gender: f.gender,
        dateOfBirth: f.dob,
        address: { line1: f.line1.trim(), city: f.city.trim(), state: f.state.trim(), pincode: f.pincode.trim() },
        qualification: f.qualification.trim() || undefined,
        experienceYears: Number(f.experience) || 0,
        languages,
        serviceAreas: [{ city: f.workCity.trim(), pincodes: f.pincodes.split(/[,\s]+/).filter((p) => /^[1-9]\d{5}$/.test(p)) }],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not register');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen footer={<Button title="Register" onPress={submit} loading={busy} disabled={!valid} />}>
      <Notice tone="info" title="Verification comes first" body="After registering, upload your government ID. Our team verifies every assistant before any home visit is assigned." />
      <T v="heading" style={{ marginTop: S.xl, marginBottom: S.md }}>About you</T>
      <Field label="Full name" required><Input value={f.name} onChangeText={set('name')} autoComplete="name" /></Field>
      <Field label="Mobile number" required><Input value={f.mobile} onChangeText={set('mobile')} keyboardType="phone-pad" /></Field>
      <Field label="Email" required><Input value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" /></Field>
      <Field label="Gender" required>
        <Choice columns={3} value={f.gender || undefined} onChange={(v) => set('gender')(v)} options={[{ value: 'FEMALE', label: 'Female' }, { value: 'MALE', label: 'Male' }, { value: 'OTHER', label: 'Other' }]} />
      </Field>
      <Field label="Date of birth" required><DateInput value={f.dob} onChange={set('dob')} maximumDate={new Date(new Date().getFullYear() - 18, 11, 31)} /></Field>
      <Field label="Password" required hint="8+ characters with a letter and a number."><Input value={f.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" /></Field>

      <T v="heading" style={{ marginTop: S.md, marginBottom: S.md }}>Your address</T>
      <Field label="House / street" required><Input value={f.line1} onChangeText={set('line1')} /></Field>
      <View style={{ flexDirection: 'row', gap: S.md }}>
        <Field label="City" required style={{ flex: 1 }}><Input value={f.city} onChangeText={set('city')} /></Field>
        <Field label="PIN code" required style={{ flex: 1 }}><Input value={f.pincode} onChangeText={set('pincode')} keyboardType="number-pad" maxLength={6} /></Field>
      </View>
      <Field label="State" required><Input value={f.state} onChangeText={set('state')} /></Field>

      <T v="heading" style={{ marginTop: S.md, marginBottom: S.md }}>Your work</T>
      <Field label="Qualification" hint="e.g. GNM Nursing, ANM, BSc Nursing"><Input value={f.qualification} onChangeText={set('qualification')} /></Field>
      <Field label="Years of experience"><Input value={f.experience} onChangeText={set('experience')} keyboardType="number-pad" maxLength={2} /></Field>
      <Field label="Languages you speak"><TagInput values={languages} onChange={setLanguages} placeholder="Add a language" suggestions={['Hindi', 'English', 'Punjabi', 'Tamil', 'Malayalam', 'Bengali', 'Marathi', 'Telugu', 'Kannada', 'Gujarati']} /></Field>
      <Field label="City where you'll take visits" required><Input value={f.workCity} onChangeText={set('workCity')} placeholder="e.g. Gurugram" /></Field>
      <Field label="PIN codes you can cover" hint="Optional. Separate with commas. Leave empty to cover the whole city."><Input value={f.pincodes} onChangeText={set('pincodes')} keyboardType="numbers-and-punctuation" /></Field>
      {error && <Notice tone="danger" title={error} />}
    </Screen>
  );
}
