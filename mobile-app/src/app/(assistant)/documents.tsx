import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/lib/api';
import { dateFull, humanize } from '@/lib/format';
import { S } from '@/lib/theme';
import type { AssistantDoc, AssistantProfile } from '@/lib/types';
import { Badge, Button, Card, Chip, ErrorView, Field, Input, Loading, Notice, Screen, Section, T } from '@/components/ui';
import { useToast } from '@/components/toast';

const TYPES = [
  { value: 'GOV_ID', label: 'Aadhaar / Govt ID', hint: 'Required before approval' },
  { value: 'PAN', label: 'PAN card' },
  { value: 'QUALIFICATION', label: 'Qualification certificate' },
  { value: 'PROFILE_PHOTO', label: 'Profile photo' },
  { value: 'OTHER', label: 'Other' },
];

export default function Documents() {
  const toast = useToast();
  const q = useQuery({ queryKey: ['assistant-profile'], queryFn: () => api.get<{ profile: AssistantProfile; documents: AssistantDoc[] }>('/assistant/profile') });
  const [type, setType] = useState('GOV_ID');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast('Allow camera/photos access in Settings', 'error');
    const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', { uri: a.uri, name: a.fileName || `${type.toLowerCase()}.jpg`, type: a.mimeType || 'image/jpeg' } as unknown as Blob);
      form.append('type', type);
      form.append('documentNumber', number.trim());
      await api.upload('/assistant/documents', form);
      toast('Uploaded. Our team will review it.');
      setNumber('');
      q.refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const { documents, profile } = q.data;
  const hasGov = documents.some((d) => d.type === 'GOV_ID' && d.status !== 'REJECTED');
  const history = profile.verificationHistory || [];
  const lastNote = [...history].reverse().find((h) => h.notes);

  return (
    <Screen>
      {!hasGov && <Notice tone="warn" title="Government ID needed" body="Upload a clear photo of your Aadhaar or other government ID. Only the last 4 digits of the number are stored." />}
      {profile.verificationStatus === 'REJECTED' && lastNote && <View style={{ marginTop: S.md }}><Notice tone="danger" title="Note from the care team" body={lastNote.notes} /></View>}

      <Section title="Uploaded">
        {documents.length === 0 ? (
          <T v="small">Nothing uploaded yet.</T>
        ) : (
          <View style={{ gap: S.sm }}>
            {documents.map((d) => (
              <Card key={d._id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
                  <T weight="semibold" style={{ flex: 1 }}>{TYPES.find((t) => t.value === d.type)?.label || humanize(d.type)}</T>
                  <Badge label={humanize(d.status)} tone={d.status === 'ACCEPTED' ? 'ok' : d.status === 'REJECTED' ? 'danger' : 'warn'} />
                </View>
                <T v="small">{d.numberLast4 ? `Ending ${d.numberLast4} · ` : ''}{dateFull(d.createdAt)}</T>
                {d.reviewNotes ? <T v="small" style={{ marginTop: 4 }}>“{d.reviewNotes}”</T> : null}
              </Card>
            ))}
          </View>
        )}
      </Section>

      <Section title="Upload a document">
        <Card>
          <Field label="Document type">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
              {TYPES.map((t) => <Chip key={t.value} label={t.label} selected={type === t.value} onPress={() => setType(t.value)} />)}
            </View>
          </Field>
          <Field label="Document number" hint="Needed for our records; only the last 4 digits are kept.">
            <Input value={number} onChangeText={setNumber} autoCapitalize="characters" />
          </Field>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Button title="Gallery" icon="images-outline" variant="secondary" style={{ flex: 1 }} loading={busy} disabled={number.trim().length < 4} onPress={() => upload(false)} />
            <Button title="Camera" icon="camera" style={{ flex: 1 }} loading={busy} disabled={number.trim().length < 4} onPress={() => upload(true)} />
          </View>
        </Card>
      </Section>
    </Screen>
  );
}
