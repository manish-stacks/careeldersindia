import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { currentCoords } from '@/lib/tracker';
import { C, S } from '@/lib/theme';
import type { Contact, Medicine, Parent } from '@/lib/types';
import { Button, Card, Chip, Choice, Field, Input, Notice, Screen, T } from './ui';
import { DateInput, TagInput } from './inputs';

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'];
const SLOTS = ['morning', 'afternoon', 'evening', 'night'] as const;
const CONDITIONS = ['Diabetes', 'High blood pressure', 'Heart condition', 'Arthritis', 'Thyroid', 'Asthma / COPD', 'Kidney condition', 'Memory loss'];

export type ParentPayload = Record<string, unknown>;

export function ParentForm({ initial, submitLabel, busy, onSubmit }: { initial?: Parent; submitLabel: string; busy?: boolean; onSubmit: (p: ParentPayload) => void }) {
  const [f, setF] = useState({
    fullName: initial?.fullName || '',
    gender: initial?.gender || ('' as '' | 'MALE' | 'FEMALE' | 'OTHER'),
    dob: initial?.dateOfBirth?.slice(0, 10) || '',
    relation: initial?.relationToOwner || '',
    mobile: initial?.mobile || '+91',
    line1: initial?.address.line1 || '',
    line2: initial?.address.line2 || '',
    landmark: initial?.address.landmark || '',
    city: initial?.address.city || '',
    state: initial?.address.state || '',
    pincode: initial?.address.pincode || '',
    blood: initial?.bloodGroup || 'UNKNOWN',
    instructions: initial?.specialInstructions || '',
  });
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(initial?.location?.coordinates ? { longitude: initial.location.coordinates[0], latitude: initial.location.coordinates[1] } : null);
  const [conditions, setConditions] = useState<string[]>(initial?.medicalConditions || []);
  const [allergies, setAllergies] = useState<string[]>(initial?.allergies || []);
  const [meds, setMeds] = useState<Medicine[]>(initial?.medicines || []);
  const [contacts, setContacts] = useState<Contact[]>(initial?.emergencyContacts?.length ? initial.emergencyContacts : [{ name: '', relation: '', mobile: '+91' }]);
  const [locBusy, setLocBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const validContacts = contacts.filter((c) => c.name.trim().length >= 2 && /^\+?[1-9]\d{7,14}$/.test(c.mobile.replace(/[\s-]/g, '')));
  const pinOk = /^[1-9]\d{5}$/.test(f.pincode);
  const mobileOk = f.mobile.replace(/[\s-]/g, '').length <= 3 || /^\+?[1-9]\d{7,14}$/.test(f.mobile.replace(/[\s-]/g, ''));
  const valid = f.fullName.trim().length >= 2 && f.gender && f.dob && f.line1.trim().length >= 3 && f.city.trim() && f.state.trim() && pinOk && mobileOk && validContacts.length > 0;

  function submit() {
    const mobile = f.mobile.replace(/[\s-]/g, '');
    onSubmit({
      fullName: f.fullName.trim(),
      gender: f.gender,
      dateOfBirth: f.dob,
      relationToOwner: f.relation.trim() || undefined,
      mobile: mobile.length > 3 ? mobile : undefined,
      address: { line1: f.line1.trim(), line2: f.line2.trim() || undefined, landmark: f.landmark.trim() || undefined, city: f.city.trim(), state: f.state.trim(), pincode: f.pincode.trim() },
      ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
      bloodGroup: f.blood,
      medicalConditions: conditions,
      allergies,
      medicines: meds.filter((m) => m.name.trim()).map((m) => ({ ...m, name: m.name.trim(), dosage: m.dosage?.trim() || undefined })),
      emergencyContacts: validContacts.map((c) => ({ name: c.name.trim(), relation: c.relation?.trim() || undefined, mobile: c.mobile.replace(/[\s-]/g, '') })),
      specialInstructions: f.instructions.trim() || undefined,
    });
  }

  return (
    <Screen footer={<Button title={submitLabel} loading={busy} disabled={!valid} onPress={submit} />}>
      <T v="heading" style={{ marginBottom: S.md }}>About them</T>
      <Field label="Full name" required><Input value={f.fullName} onChangeText={set('fullName')} autoCapitalize="words" /></Field>
      <Field label="Your relationship" hint="e.g. Mother, Father, Grandmother"><Input value={f.relation} onChangeText={set('relation')} /></Field>
      <Field label="Gender" required>
        <Choice columns={3} value={f.gender || undefined} onChange={(v) => set('gender')(v)} options={[{ value: 'FEMALE', label: 'Female' }, { value: 'MALE', label: 'Male' }, { value: 'OTHER', label: 'Other' }]} />
      </Field>
      <Field label="Date of birth" required><DateInput value={f.dob} onChange={set('dob')} maximumDate={new Date()} /></Field>
      <Field label="Their phone" hint="So the care assistant can call when they arrive." error={mobileOk ? undefined : 'Enter a valid number with country code'}>
        <Input value={f.mobile} onChangeText={set('mobile')} keyboardType="phone-pad" />
      </Field>

      <T v="heading" style={{ marginTop: S.md, marginBottom: S.md }}>Home address</T>
      <Field label="House / flat and street" required><Input value={f.line1} onChangeText={set('line1')} /></Field>
      <Field label="Area / sector"><Input value={f.line2} onChangeText={set('line2')} /></Field>
      <Field label="Landmark" hint="Helps the assistant find the house"><Input value={f.landmark} onChangeText={set('landmark')} /></Field>
      <View style={{ flexDirection: 'row', gap: S.md }}>
        <Field label="City" required style={{ flex: 1 }}><Input value={f.city} onChangeText={set('city')} /></Field>
        <Field label="PIN code" required style={{ flex: 1 }} error={f.pincode && !pinOk ? '6 digits' : undefined}><Input value={f.pincode} onChangeText={set('pincode')} keyboardType="number-pad" maxLength={6} /></Field>
      </View>
      <Field label="State" required><Input value={f.state} onChangeText={set('state')} /></Field>
      <Card style={{ marginBottom: S.lg }}>
        <T weight="semibold">{coords ? 'Map pin saved' : 'Are you at their home right now?'}</T>
        <T v="small">{coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : 'Saving the exact location helps the care assistant reach faster. You can skip this.'}</T>
        <Button
          title={coords ? 'Update to my current location' : 'Use my current location'}
          icon="locate-outline"
          size="md"
          variant="secondary"
          loading={locBusy}
          style={{ marginTop: S.md }}
          onPress={async () => {
            setLocBusy(true);
            const c = await currentCoords();
            setLocBusy(false);
            if (c) setCoords(c);
          }}
        />
      </Card>

      <T v="heading" style={{ marginTop: S.md, marginBottom: S.xs }}>Health details</T>
      <T v="small" style={{ marginBottom: S.md }}>Shared only with the assigned care assistant and our care team.</T>
      <Field label="Blood group">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
          {BLOOD.map((b) => <Chip key={b} label={b === 'UNKNOWN' ? "Don't know" : b} selected={f.blood === b} onPress={() => set('blood')(b)} />)}
        </View>
      </Field>
      <Field label="Health conditions"><TagInput values={conditions} onChange={setConditions} placeholder="Type a condition" suggestions={CONDITIONS} /></Field>
      <Field label="Allergies" hint="Medicines or foods they react to"><TagInput values={allergies} onChange={setAllergies} placeholder="e.g. Penicillin" /></Field>

      <Field label="Medicines">
        <View style={{ gap: S.sm }}>
          {meds.map((m, i) => (
            <Card key={i}>
              <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'center' }}>
                <View style={{ flex: 2 }}><Input value={m.name} placeholder="Medicine name" onChangeText={(t) => setMeds(meds.map((x, j) => (j === i ? { ...x, name: t } : x)))} /></View>
                <View style={{ flex: 1 }}><Input value={m.dosage} placeholder="Dose" onChangeText={(t) => setMeds(meds.map((x, j) => (j === i ? { ...x, dosage: t } : x)))} /></View>
                <Pressable accessibilityLabel="Remove medicine" onPress={() => setMeds(meds.filter((_, j) => j !== i))} hitSlop={8}>
                  <Ionicons name="trash-outline" size={22} color={C.danger} />
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.sm }}>
                {SLOTS.map((s) => (
                  <Chip key={s} label={s[0].toUpperCase() + s.slice(1)} selected={!!m.schedule?.[s]} onPress={() => setMeds(meds.map((x, j) => (j === i ? { ...x, schedule: { ...x.schedule, [s]: !x.schedule?.[s] } } : x)))} />
                ))}
              </View>
            </Card>
          ))}
          <Button title="Add a medicine" icon="add" variant="secondary" size="md" onPress={() => setMeds([...meds, { name: '', dosage: '', schedule: {} }])} />
        </View>
      </Field>

      <T v="heading" style={{ marginTop: S.md, marginBottom: S.xs }}>Emergency contacts</T>
      <T v="small" style={{ marginBottom: S.md }}>Who should we call if something is wrong? At least one, ideally someone nearby.</T>
      {contacts.map((c, i) => (
        <Card key={i} style={{ marginBottom: S.sm }}>
          <Field label="Name"><Input value={c.name} onChangeText={(t) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: t } : x)))} /></Field>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Field label="Relation" style={{ flex: 1 }}><Input value={c.relation} onChangeText={(t) => setContacts(contacts.map((x, j) => (j === i ? { ...x, relation: t } : x)))} placeholder="Neighbour" /></Field>
            <Field label="Mobile" style={{ flex: 1.3 }}><Input value={c.mobile} keyboardType="phone-pad" onChangeText={(t) => setContacts(contacts.map((x, j) => (j === i ? { ...x, mobile: t } : x)))} /></Field>
          </View>
          {contacts.length > 1 && (
            <Pressable onPress={() => setContacts(contacts.filter((_, j) => j !== i))}>
              <T color={C.danger} weight="semibold">Remove</T>
            </Pressable>
          )}
        </Card>
      ))}
      {contacts.length < 5 && <Button title="Add another contact" icon="add" variant="secondary" size="md" onPress={() => setContacts([...contacts, { name: '', relation: '', mobile: '+91' }])} />}
      {validContacts.length === 0 && <View style={{ marginTop: S.md }}><Notice tone="warn" title="Add at least one emergency contact with a valid mobile number." /></View>}

      <Field label="Special instructions" hint="Anything else: hearing, language, pets, stairs, best time to call." style={{ marginTop: S.xl }}>
        <Input value={f.instructions} onChangeText={set('instructions')} multiline maxLength={2000} />
      </Field>
    </Screen>
  );
}
