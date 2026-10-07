import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError, fixUrl } from '@/lib/api';
import { confirm } from '@/lib/hooks';
import { stopTracking } from '@/lib/tracker';
import { humanize, time } from '@/lib/format';
import { C, R, S } from '@/lib/theme';
import type { Measurements, MedSlot, MedStatus, Visit, VitalKey } from '@/lib/types';
import { Button, Card, Chip, Choice, ErrorView, Field, Input, Loading, Notice, Screen, Section, Segmented, Sheet, T, Toggle } from '@/components/ui';
import { DateInput, NumberBox } from '@/components/inputs';
import { vitalRows } from '@/components/visit-summary';
import { useToast } from '@/components/toast';

// Plausibility limits (same as the server) — catch typos, not clinical judgement
const LIM = { sys: [50, 260], dia: [30, 160], pulse: [20, 250], spo2: [50, 100], tF: [90, 110], tC: [32, 43.5], weight: [20, 250], sugar: [20, 600] } as const;
const SYMPTOMS = ['Fever', 'Cough', 'Weakness', 'Dizziness', 'Breathlessness', 'Chest discomfort', 'Pain', 'Swelling', 'Headache', 'Nausea', 'Other'];
const SLOT_OF: Record<string, MedSlot> = { morning: 'MORNING', afternoon: 'AFTERNOON', evening: 'EVENING', night: 'NIGHT' };
const MEDIA_TYPES = [
  { value: 'PRESCRIPTION', label: 'Prescription' },
  { value: 'MEDICINE', label: 'Medicines' },
  { value: 'TEST_REPORT', label: 'Test report' },
  { value: 'WOUND', label: 'Wound / skin' },
  { value: 'OTHER', label: 'Other' },
] as const;

type Vals = { sys: string; dia: string; pulse: string; spo2: string; temp: string; tUnit: 'F' | 'C'; weight: string; sugar: string; sugarCtx: 'FASTING' | 'RANDOM' | 'POST_MEAL' };
const s = (n?: number) => (n === undefined || n === null ? '' : String(n));
const inRange = (v: string, [lo, hi]: readonly [number, number]) => v === '' || (Number(v) >= lo && Number(v) <= hi);

export default function VisitForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['visit', id], queryFn: () => api.get<Visit>(`/assistant/jobs/${id}/visit`), refetchOnWindowFocus: false });
  const v = q.data;

  const [vals, setVals] = useState<Vals | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [symptomNotes, setSymptomNotes] = useState('');
  const [meds, setMeds] = useState<MedStatus[]>([]);
  const [mobility, setMobility] = useState<Visit['mobility']>();
  const [wellbeing, setWellbeing] = useState<NonNullable<Visit['wellbeing']>>({});
  const [notes, setNotes] = useState('');
  const [reportMode, setReportMode] = useState<'FORM' | 'IMAGE'>('FORM');
  const [sheets, setSheets] = useState<Record<string, { date?: string; checked: string[]; vals: Record<string, string> }>>({});
  const sheet = (id: string) => sheets[id] || { checked: [], vals: {} };
  const patchSheet = (id: string, p: Partial<{ date: string; checked: string[]; vals: Record<string, string> }>) => setSheets((x) => ({ ...x, [id]: { ...(x[id] || { checked: [], vals: {} }), ...p } }));
  const [overall, setOverall] = useState<Visit['overallStatus']>();
  const [urgent, setUrgent] = useState({ reason: '', notes: '', recommendedEscalation: '' });
  const [followUp, setFollowUp] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [saveState, setSaveState] = useState<{ at?: string; saving?: boolean; failed?: boolean }>({});
  const [review, setReview] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ open: boolean; type: string; caption: string; busy: boolean }>({ open: false, type: 'PRESCRIPTION', caption: '', busy: false });
  const loaded = useRef(false);
  const dirty = useRef(false);

  // hydrate once from the saved draft
  useEffect(() => {
    if (!v || loaded.current) return;
    loaded.current = true;
    const m = v.measurements || {};
    setVals({
      sys: s(m.bp?.systolic), dia: s(m.bp?.diastolic), pulse: s(m.pulse), spo2: s(m.spo2), temp: s(m.temperature?.value), tUnit: m.temperature?.unit || 'F',
      weight: s(m.weight?.value), sugar: s(m.bloodSugar?.value), sugarCtx: m.bloodSugar?.context || 'RANDOM',
    });
    setSymptoms(v.symptoms || []);
    setSymptomNotes(v.symptomNotes || '');
    const planned: MedStatus[] = [];
    (v.form?.medicines || []).forEach((med) =>
      Object.entries(med.schedule || {}).filter(([, on]) => on).forEach(([slot]) => {
        const prior = v.medicationStatus?.find((x) => x.medicineName === med.name && x.slot === SLOT_OF[slot]);
        planned.push(prior || { medicineName: med.name, slot: SLOT_OF[slot], status: 'UNKNOWN', reportedBy: 'PATIENT' });
      })
    );
    setMeds(planned);
    setMobility(v.mobility);
    setWellbeing(v.wellbeing || {});
    setNotes(v.notes || '');
    setReportMode(v.reportMode || 'FORM');
    setSheets(Object.fromEntries((v.reports || []).map((r) => [r.templateId, { date: r.reportDate, checked: r.checked || [], vals: Object.fromEntries((r.values || []).map((x) => [x.key, x.value])) }])));
    setOverall(v.overallStatus);
    if (v.urgent) setUrgent(v.urgent);
    setFollowUp(!!v.followUpRequired);
    setFollowUpNotes(v.followUpNotes || '');
    if (v.draftSavedAt) setSaveState({ at: v.draftSavedAt });
  }, [v]);

  const fields = v?.form?.fields;
  const want = useMemo(() => new Map((fields?.vitals || []).map((x) => [x.key, x.required])), [fields]);
  const has = (k: VitalKey) => want.has(k);
  const req = (k: VitalKey) => !!want.get(k);

  const errors = useMemo(() => {
    if (!vals) return {} as Record<string, string>;
    const e: Record<string, string> = {};
    if (!inRange(vals.sys, LIM.sys)) e.sys = 'Check systolic (50–260)';
    if (!inRange(vals.dia, LIM.dia)) e.dia = 'Check diastolic (30–160)';
    if (vals.sys && vals.dia && Number(vals.sys) <= Number(vals.dia)) e.dia = 'Systolic should be higher than diastolic';
    if (!inRange(vals.pulse, LIM.pulse)) e.pulse = 'Check pulse (20–250)';
    if (!inRange(vals.spo2, LIM.spo2)) e.spo2 = 'Check SpO₂ (50–100)';
    if (!inRange(vals.temp, vals.tUnit === 'C' ? LIM.tC : LIM.tF)) e.temp = vals.tUnit === 'C' ? 'Check temperature (32–43.5 °C)' : 'Check temperature (90–110 °F)';
    if (!inRange(vals.weight, LIM.weight)) e.weight = 'Check weight (20–250 kg)';
    if (!inRange(vals.sugar, LIM.sugar)) e.sugar = 'Check sugar (20–600)';
    return e;
  }, [vals]);

  /** Only valid, filled values go to the server — drafts never carry typos. */
  const measurements = useMemo((): Measurements => {
    if (!vals) return {};
    const m: Measurements = {};
    if (vals.sys && vals.dia && !errors.sys && !errors.dia) m.bp = { systolic: Number(vals.sys), diastolic: Number(vals.dia) };
    if (vals.pulse && !errors.pulse) m.pulse = Math.round(Number(vals.pulse));
    if (vals.spo2 && !errors.spo2) m.spo2 = Number(vals.spo2);
    if (vals.temp && !errors.temp) m.temperature = { value: Number(vals.temp), unit: vals.tUnit };
    if (vals.weight && !errors.weight) m.weight = { value: Number(vals.weight), unit: 'KG' };
    if (vals.sugar && !errors.sugar) m.bloodSugar = { value: Number(vals.sugar), unit: 'mg/dL', context: vals.sugarCtx };
    return m;
  }, [vals, errors]);

  const templates = v?.form?.reportTemplates || [];
  const hasTable = templates.some((t) => t.kind === 'TABLE');
  const reports = templates.map((t) => {
    const sh = sheets[t._id] || { checked: [], vals: {} };
    return {
      templateId: t._id, name: t.name, kind: t.kind, reportDate: sh.date || undefined,
      checked: t.kind === 'CHECKLIST' ? sh.checked : [],
      values: t.kind === 'TABLE' && reportMode === 'FORM' ? t.items.filter((i) => sh.vals[i.key]?.trim()).map((i) => ({ key: i.key, label: i.label, value: sh.vals[i.key].trim() })) : [],
    };
  });

  const payload = useCallback(
    () => ({
      reportMode,
      reports: reports.length ? reports : undefined,
      measurements,
      symptoms,
      symptomNotes: symptomNotes.trim() || undefined,
      medicationStatus: meds.length ? meds : undefined,
      mobility,
      wellbeing: Object.keys(wellbeing).length ? wellbeing : undefined,
      notes: notes.trim() || undefined,
      overallStatus: overall,
      urgent: overall === 'URGENT_ATTENTION' && urgent.reason.trim().length >= 3 && urgent.notes.trim().length >= 3 && urgent.recommendedEscalation ? { ...urgent, reason: urgent.reason.trim(), notes: urgent.notes.trim() } : undefined,
      followUpRequired: followUp,
      followUpNotes: followUp ? followUpNotes.trim() || undefined : undefined,
    }),
    [measurements, symptoms, symptomNotes, meds, mobility, wellbeing, notes, overall, urgent, followUp, followUpNotes, reportMode, sheets, templates.length]
  );

  // autosave 2.5 s after the last change
  useEffect(() => {
    if (!loaded.current || !vals) return;
    if (!dirty.current) {
      dirty.current = true;
      return;
    }
    const t = setTimeout(async () => {
      setSaveState((x) => ({ ...x, saving: true, failed: false }));
      try {
        const r = await api.patch<{ draftSavedAt: string }>(`/assistant/jobs/${id}/visit`, payload());
        setSaveState({ at: r.draftSavedAt });
      } catch {
        setSaveState((x) => ({ ...x, saving: false, failed: true }));
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [payload, id, vals]);

  if (q.isLoading || (v && !vals)) return <Loading />;
  if (q.isError || !v || !vals) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;

  if (v.status === 'COMPLETED')
    return (
      <Screen footer={<Button title="Back to visit" onPress={() => router.replace(`/job/${id}`)} />}>
        <Notice tone="ok" title="This visit is already completed" body="Need to fix a value? Ask the care desk to correct it." />
      </Screen>
    );

  const set = (k: keyof Vals) => (x: string) => setVals((o) => (o ? { ...o, [k]: x } : o));
  const missing: string[] = [];
  if (req('bp') && !measurements.bp) missing.push('Blood pressure');
  if (req('pulse') && !measurements.pulse) missing.push('Pulse');
  if (req('spo2') && !measurements.spo2) missing.push('SpO₂');
  if (req('temperature') && !measurements.temperature) missing.push('Temperature');
  if (req('weight') && !measurements.weight) missing.push('Weight');
  if (req('bloodSugar') && !measurements.bloodSugar) missing.push('Blood sugar');
  const minPhotos = fields?.minPhotos || 0;
  const photos = v.media || [];
  if (photos.length < minPhotos) missing.push(`${minPhotos - photos.length} more photo${minPhotos - photos.length > 1 ? 's' : ''}`);
  if (hasTable && reportMode === 'IMAGE' && !photos.some((m) => m.type === 'TEST_REPORT')) missing.push('Report image (add a photo of type Test report)');
  if (!overall) missing.push('Overall status');
  if (overall === 'URGENT_ATTENTION' && !payload().urgent) missing.push('Urgent details');
  const hasErrors = Object.keys(errors).length > 0;

  async function pick(camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast('Allow camera/photos access in Settings', 'error');
    const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    setUpload((u) => ({ ...u, busy: true }));
    try {
      const form = new FormData();
      form.append('file', { uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' } as unknown as Blob);
      form.append('type', upload.type);
      if (upload.caption.trim()) form.append('caption', upload.caption.trim());
      await api.upload(`/assistant/jobs/${id}/visit/media`, form);
      await q.refetch();
      toast('Photo added');
      setUpload({ open: false, type: 'PRESCRIPTION', caption: '', busy: false });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error');
      setUpload((u) => ({ ...u, busy: false }));
    }
  }

  async function removePhoto(mediaId: string) {
    if (!(await confirm('Remove photo?', 'It will not be part of the report.', 'Remove', true))) return;
    await api.del(`/assistant/jobs/${id}/visit/media/${mediaId}`).catch((e: Error) => toast(e.message, 'error'));
    q.refetch();
  }

  async function complete() {
    setServerError(null);
    setCompleting(true);
    const keyName = `visit-complete-key:${id}`;
    let key = await AsyncStorage.getItem(keyName);
    if (!key) {
      key = Crypto.randomUUID();
      await AsyncStorage.setItem(keyName, key);
    }
    try {
      await api.post(`/assistant/jobs/${id}/visit/complete`, { ...payload(), confirm: true }, { 'Idempotency-Key': key });
      await AsyncStorage.removeItem(keyName);
      await stopTracking();
      ['jobs', 'home', 'booking'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setReview(false);
      toast('Visit completed. Report sent to the family.');
      router.replace(`/job/${id}`);
    } catch (e) {
      // key is kept: a retry after a network drop replays safely instead of double-completing
      setServerError(e instanceof ApiError ? e.message : 'Could not complete. Check your connection and try again.');
    } finally {
      setCompleting(false);
    }
  }

  const summary = vitalRows(measurements);

  return (
    <Screen
      footer={
        <View>
          <T v="caption" style={{ marginBottom: 6, textAlign: 'center' }}>
            {saveState.saving ? 'Saving…' : saveState.failed ? 'Not saved: no connection. Will retry on the next change.' : saveState.at ? `Draft saved ${time(saveState.at)}` : 'Changes save automatically'}
          </T>
          <Button title="Review and complete" icon="checkmark-done" disabled={hasErrors} onPress={() => setReview(true)} />
        </View>
      }
    >
      <Stack.Screen options={{ title: v.form?.parentName || 'Record visit' }} />
      <T v="small">Record what you measure and observe. Do not diagnose. If something seems wrong, mark it as needing attention.</T>

      {fields?.vitals?.length ? (
        <Section title="Measurements">
          <Card style={{ gap: S.lg }}>
            {has('bp') && (
              <Field label="Blood pressure (mmHg)" required={req('bp')} error={errors.sys || errors.dia} style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
                  <NumberBox label="Systolic" value={vals.sys} onChange={set('sys')} placeholder="120" invalid={!!errors.sys} />
                  <T v="title" color={C.faint}>/</T>
                  <NumberBox label="Diastolic" value={vals.dia} onChange={set('dia')} placeholder="80" invalid={!!errors.dia} />
                </View>
              </Field>
            )}
            {(has('pulse') || has('spo2')) && (
              <View style={{ flexDirection: 'row', gap: S.md }}>
                {has('pulse') && <Field label="Pulse" required={req('pulse')} error={errors.pulse} style={{ flex: 1, marginBottom: 0 }}><NumberBox label="Pulse" value={vals.pulse} onChange={set('pulse')} unit="bpm" placeholder="72" invalid={!!errors.pulse} /></Field>}
                {has('spo2') && <Field label="SpO₂" required={req('spo2')} error={errors.spo2} style={{ flex: 1, marginBottom: 0 }}><NumberBox label="SpO2" value={vals.spo2} onChange={set('spo2')} unit="%" placeholder="98" invalid={!!errors.spo2} /></Field>}
              </View>
            )}
            {has('temperature') && (
              <Field label="Temperature" required={req('temperature')} error={errors.temp} style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'center' }}>
                  <NumberBox label="Temperature" value={vals.temp} onChange={set('temp')} placeholder={vals.tUnit === 'F' ? '98.6' : '37'} invalid={!!errors.temp} />
                  <Chip label="°F" selected={vals.tUnit === 'F'} onPress={() => set('tUnit')('F')} />
                  <Chip label="°C" selected={vals.tUnit === 'C'} onPress={() => set('tUnit')('C')} />
                </View>
              </Field>
            )}
            {has('weight') && <Field label="Weight" required={req('weight')} error={errors.weight} style={{ marginBottom: 0 }}><NumberBox label="Weight" value={vals.weight} onChange={set('weight')} unit="kg" invalid={!!errors.weight} /></Field>}
            {has('bloodSugar') && (
              <Field label="Blood sugar (mg/dL)" required={req('bloodSugar')} error={errors.sugar} style={{ marginBottom: 0 }}>
                <NumberBox label="Blood sugar" value={vals.sugar} onChange={set('sugar')} unit="mg/dL" invalid={!!errors.sugar} />
                <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.sm }}>
                  {(['FASTING', 'RANDOM', 'POST_MEAL'] as const).map((c) => <Chip key={c} label={c === 'POST_MEAL' ? 'After meal' : humanize(c)} selected={vals.sugarCtx === c} onPress={() => set('sugarCtx')(c)} />)}
                </View>
              </Field>
            )}
          </Card>
        </Section>
      ) : null}

      {fields?.collectSymptoms !== false && (
        <Section title="Symptoms they mention">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
            {(v.form?.symptomsList?.length ? v.form.symptomsList : SYMPTOMS).map((x) => (
              <Chip key={x} label={x} selected={symptoms.includes(x)} onPress={() => setSymptoms(symptoms.includes(x) ? symptoms.filter((y) => y !== x) : [...symptoms, x])} />
            ))}
          </View>
          <Field label="In their words (optional)" style={{ marginTop: S.md }}>
            <Input value={symptomNotes} onChangeText={setSymptomNotes} multiline placeholder="e.g. Knee pain since two days, worse on stairs" />
          </Field>
        </Section>
      )}

      {fields?.collectMedication !== false && meds.length > 0 && (
        <Section title="Medicines check">
          <View style={{ gap: S.sm }}>
            {meds.map((m, i) => (
              <Card key={`${m.medicineName}-${m.slot}`}>
                <T weight="semibold">{m.medicineName} <T v="small">· {humanize(m.slot)}</T></T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.sm }}>
                  {(['TAKEN', 'MISSED', 'NOT_DUE', 'UNKNOWN'] as const).map((st) => (
                    <Chip key={st} label={st === 'UNKNOWN' ? "Don't know" : humanize(st)} selected={m.status === st} onPress={() => setMeds(meds.map((x, j) => (j === i ? { ...x, status: st } : x)))} />
                  ))}
                </View>
              </Card>
            ))}
          </View>
        </Section>
      )}

      {fields?.collectMobility && (
        <Section title="Moving around">
          <Choice value={mobility} onChange={setMobility} options={[{ value: 'INDEPENDENT', label: 'On their own' }, { value: 'NEEDS_SUPPORT', label: 'Needs support' }, { value: 'ASSISTED_DEVICE', label: 'Walker / stick' }, { value: 'BEDRIDDEN', label: 'Bedridden' }]} />
        </Section>
      )}

      {fields?.collectWellbeing && (
        <Section title="Wellbeing">
          {([
            ['appetite', 'Appetite', ['GOOD', 'REDUCED', 'POOR']],
            ['sleep', 'Sleep', ['GOOD', 'DISTURBED', 'POOR']],
            ['mood', 'Mood', ['CHEERFUL', 'CALM', 'LOW', 'ANXIOUS', 'CONFUSED']],
            ['hydration', 'Drinking water', ['ADEQUATE', 'LOW']],
          ] as const).map(([k, label, opts]) => (
            <Field key={k} label={label}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
                {opts.map((o) => <Chip key={o} label={humanize(o)} selected={wellbeing[k] === o} onPress={() => setWellbeing({ ...wellbeing, [k]: o })} />)}
              </View>
            </Field>
          ))}
        </Section>
      )}

      {templates.map((t) => {
        const sh = sheet(t._id);
        const firstTable = t.kind === 'TABLE' && templates.find((x) => x.kind === 'TABLE')?._id === t._id;
        return (
          <Section key={t._id} title={t.name}>
            {t.kind === 'CHECKLIST' ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
                  {t.items.map((i) => (
                    <Chip key={i.key} label={i.label} selected={sh.checked.includes(i.label)} onPress={() => patchSheet(t._id, { checked: sh.checked.includes(i.label) ? sh.checked.filter((y) => y !== i.label) : [...sh.checked, i.label] })} />
                  ))}
                </View>
                <T v="caption" style={{ marginTop: S.sm }}>{sh.checked.length} selected. Tap everything performed during this visit.</T>
              </>
            ) : (
              <>
                {firstTable && <Segmented value={reportMode} onChange={setReportMode} items={[{ value: 'FORM', label: 'Fill values' }, { value: 'IMAGE', label: 'Upload image' }]} />}
                {reportMode === 'FORM' ? (
                  <View style={{ marginTop: S.md, gap: S.sm }}>
                    <Field label="Report date"><DateInput value={sh.date || ''} onChange={(d) => patchSheet(t._id, { date: d })} maximumDate={new Date()} /></Field>
                    {t.items.map((i) => (
                      <Field key={i.key} label={i.label}>
                        <Input value={sh.vals[i.key] || ''} onChangeText={(x) => patchSheet(t._id, { vals: { ...sh.vals, [i.key]: x } })} placeholder="Leave empty if not tested" />
                      </Field>
                    ))}
                  </View>
                ) : (
                  <View style={{ marginTop: S.md, gap: S.sm }}>
                    <Notice tone="info" title="Upload the report as an image" body="Photograph the paper report or pick the scan from your gallery. Make sure all values are readable." />
                    <Button title="Add report image" icon="camera" onPress={() => setUpload((u) => ({ ...u, open: true, type: 'TEST_REPORT' }))} />
                    <T v="caption">{photos.filter((m) => m.type === 'TEST_REPORT').length} report image(s) added.</T>
                  </View>
                )}
              </>
            )}
          </Section>
        );
      })}

      <Section title={`Photos${minPhotos ? ` (at least ${minPhotos})` : ''}`}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
          {photos.map((m) => (
            <View key={m._id}>
              <Image source={{ uri: fixUrl(m.url) }} style={styles.photo} accessibilityLabel={m.caption || humanize(m.type)} />
              <Pressable onPress={() => removePhoto(m._id)} style={styles.remove} accessibilityLabel="Remove photo" hitSlop={6}>
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
              <T v="caption" style={{ width: 96 }} numberOfLines={1}>{humanize(m.type)}</T>
            </View>
          ))}
          <Pressable onPress={() => setUpload((u) => ({ ...u, open: true }))} style={[styles.photo, styles.add]} accessibilityRole="button" accessibilityLabel="Add photo">
            <Ionicons name="camera-outline" size={28} color={C.brand} />
            <T v="caption" color={C.brand}>Add</T>
          </Pressable>
        </View>
        <T v="caption" style={{ marginTop: S.sm }}>Photograph prescriptions, medicine strips or reports. Avoid faces unless needed.</T>
      </Section>

      <Section title="Your observations">
        <Input value={notes} onChangeText={setNotes} multiline placeholder="What did you notice? How were they today?" />
      </Section>

      <Section title="Overall">
        <Choice
          columns={1}
          value={overall}
          onChange={setOverall}
          options={[
            { value: 'STABLE', label: 'Stable: nothing unusual', tone: 'ok', icon: 'checkmark-circle' },
            { value: 'NEEDS_ATTENTION', label: 'Needs attention: family should follow up', tone: 'warn', icon: 'eye' },
            { value: 'URGENT_ATTENTION', label: 'Urgent: needs help today', tone: 'danger', icon: 'alert-circle' },
          ]}
        />
        {overall === 'URGENT_ATTENTION' && (
          <Card tone="danger" style={{ marginTop: S.md }}>
            <T weight="semibold" color={C.danger} style={{ marginBottom: S.sm }}>The care desk and family are alerted immediately when you complete. If life is at risk, call 112 now.</T>
            <Field label="What is the concern?" required><Input value={urgent.reason} onChangeText={(t) => setUrgent({ ...urgent, reason: t })} placeholder="e.g. BP very high, chest discomfort" /></Field>
            <Field label="Details" required><Input value={urgent.notes} onChangeText={(t) => setUrgent({ ...urgent, notes: t })} multiline /></Field>
            <Field label="Suggested next step" required>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
                {['CALL_FAMILY', 'CALL_DOCTOR', 'HOSPITAL_VISIT', 'AMBULANCE', 'OTHER'].map((e) => <Chip key={e} label={humanize(e)} selected={urgent.recommendedEscalation === e} onPress={() => setUrgent({ ...urgent, recommendedEscalation: e })} />)}
              </View>
            </Field>
          </Card>
        )}
        <Card style={{ marginTop: S.md }}>
          <Toggle label="Suggest a follow-up" description="e.g. a doctor visit or a test" value={followUp} onChange={setFollowUp} />
          {followUp && <Input value={followUpNotes} onChangeText={setFollowUpNotes} placeholder="What should the family arrange?" multiline />}
        </Card>
      </Section>

      <Sheet
        open={upload.open}
        onClose={() => setUpload((u) => ({ ...u, open: false }))}
        title="Add a photo"
        footer={
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Button title="Gallery" variant="secondary" icon="images-outline" style={{ flex: 1 }} loading={upload.busy} onPress={() => pick(false)} />
            <Button title="Camera" icon="camera" style={{ flex: 1 }} loading={upload.busy} onPress={() => pick(true)} />
          </View>
        }
      >
        <Field label="What is it?">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
            {MEDIA_TYPES.map((t) => <Chip key={t.value} label={t.label} selected={upload.type === t.value} onPress={() => setUpload((u) => ({ ...u, type: t.value }))} />)}
          </View>
        </Field>
        <Field label="Caption (optional)"><Input value={upload.caption} onChangeText={(t) => setUpload((u) => ({ ...u, caption: t }))} /></Field>
      </Sheet>

      <Sheet
        open={review}
        onClose={() => setReview(false)}
        title="Check before sending"
        footer={<Button title="Complete visit and send report" icon="send" loading={completing} disabled={missing.length > 0} onPress={complete} />}
      >
        {missing.length > 0 && <Notice tone="warn" title="Still needed" body={missing.join(', ')} />}
        {serverError && <View style={{ marginTop: S.sm }}><Notice tone="danger" title={serverError} /></View>}
        <View style={{ marginTop: S.md, gap: 6 }}>
          {summary.map(([k, val]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="small">{k}</T>
              <T weight="semibold">{val}</T>
            </View>
          ))}
          {symptoms.length > 0 && <T v="small">Symptoms: {symptoms.join(', ')}</T>}
          <T v="small">Photos: {photos.length}</T>
          {overall && <T weight="semibold" color={overall === 'STABLE' ? C.ok : overall === 'NEEDS_ATTENTION' ? C.warn : C.danger}>Overall: {humanize(overall)}</T>}
        </View>
        <T v="caption" style={{ marginTop: S.md }}>After completing, values can only be changed by the care desk. The family receives the report right away.</T>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: 96, height: 96, borderRadius: R.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  add: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: C.brand, borderWidth: 1.5 },
  remove: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(31,35,40,0.7)', alignItems: 'center', justifyContent: 'center' },
});
