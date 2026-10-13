'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCheck, Trash2 } from 'lucide-react';
import { get, http, patch } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Panel, ErrorState, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { cn, humanize } from '@/lib/utils';
import type { Measurements, Visit } from '@/lib/types';

const LIM = { sys: [50, 260], dia: [30, 160], pulse: [20, 250], spo2: [50, 100], tF: [90, 110], tC: [32, 43.5], weight: [20, 250], sugar: [20, 600] } as const;
const SYMPTOMS = ['Fever', 'Cough', 'Weakness', 'Dizziness', 'Breathlessness', 'Chest discomfort', 'Pain', 'Swelling', 'Headache', 'Nausea', 'Other'];
const SLOT: Record<string, string> = { morning: 'MORNING', afternoon: 'AFTERNOON', evening: 'EVENING', night: 'NIGHT' };
const MEDIA = [['PRESCRIPTION', 'Prescription'], ['MEDICINE', 'Medicines'], ['TEST_REPORT', 'Test report'], ['WOUND', 'Wound / skin'], ['OTHER', 'Other']] as const;
const OVERALL = [['STABLE', 'Stable: nothing unusual', 'border-[#16a34a] bg-[#dcfce7]'], ['NEEDS_ATTENTION', 'Needs attention: family should follow up', 'border-warn bg-warn-soft'], ['URGENT_ATTENTION', 'Urgent: needs help today', 'border-danger bg-danger-soft']] as const;
const ESC = ['CALL_FAMILY', 'CALL_DOCTOR', 'HOSPITAL_VISIT', 'AMBULANCE', 'OTHER'];

type Med = { medicineName: string; slot: string; status: string; reportedBy?: string };
type Sheet = { date?: string; checked: string[]; vals: Record<string, string> };
type Vals = { sys: string; dia: string; pulse: string; spo2: string; temp: string; tUnit: 'F' | 'C'; weight: string; sugar: string; sugarCtx: string };
const str = (n?: number) => (n === undefined || n === null ? '' : String(n));
const inRange = (v: string, [lo, hi]: readonly [number, number]) => v === '' || (Number(v) >= lo && Number(v) <= hi);

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={on} className={cn('min-h-[40px] rounded-full border px-3.5 py-1.5 text-sm font-medium', on ? 'border-brand bg-brand-soft text-brand' : 'border-line-strong bg-white text-ink-soft')}>{on ? '✓ ' : ''}{children}</button>;
}

export function VisitForm({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['assistant', 'visit', jobId], queryFn: () => get<Visit>(`/assistant/jobs/${jobId}/visit`), refetchOnWindowFocus: false });
  const v = q.data;
  const [vals, setVals] = useState<Vals | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [symptomNotes, setSymptomNotes] = useState('');
  const [meds, setMeds] = useState<Med[]>([]);
  const [mobility, setMobility] = useState<string>();
  const [wellbeing, setWellbeing] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<'FORM' | 'IMAGE'>('FORM');
  const [sheets, setSheets] = useState<Record<string, Sheet>>({});
  const [search, setSearch] = useState('');
  const [overall, setOverall] = useState<string>();
  const [urgent, setUrgent] = useState({ reason: '', notes: '', recommendedEscalation: '' });
  const [followUp, setFollowUp] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [save, setSave] = useState<{ at?: string; saving?: boolean; failed?: boolean }>({});
  const [review, setReview] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [up, setUp] = useState({ type: 'PRESCRIPTION', caption: '', busy: false });
  const loaded = useRef(false);
  const dirty = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sh = (id: string): Sheet => sheets[id] || { checked: [], vals: {} };
  const patchSheet = (id: string, p: Partial<Sheet>) => setSheets((x) => ({ ...x, [id]: { ...sh(id), ...p } }));

  useEffect(() => {
    if (!v || loaded.current) return;
    loaded.current = true;
    const m = v.measurements || {};
    setVals({ sys: str(m.bp?.systolic), dia: str(m.bp?.diastolic), pulse: str(m.pulse), spo2: str(m.spo2), temp: str(m.temperature?.value), tUnit: m.temperature?.unit || 'F', weight: str(m.weight?.value), sugar: str(m.bloodSugar?.value), sugarCtx: m.bloodSugar?.context || 'RANDOM' });
    setSymptoms(v.symptoms || []);
    setSymptomNotes(v.symptomNotes || '');
    const planned: Med[] = [];
    (v.form?.medicines || []).forEach((med) => Object.entries(med.schedule || {}).filter(([, on]) => on).forEach(([slot]) => {
      const prior = v.medicationStatus?.find((x) => x.medicineName === med.name && x.slot === SLOT[slot]);
      planned.push(prior || { medicineName: med.name, slot: SLOT[slot], status: 'UNKNOWN', reportedBy: 'PATIENT' });
    }));
    setMeds(planned);
    setMobility(v.mobility);
    setWellbeing(v.wellbeing || {});
    setNotes(v.notes || '');
    setMode(v.reportMode || 'FORM');
    setSheets(Object.fromEntries((v.reports || []).map((r) => [r.templateId, { date: r.reportDate, checked: r.checked || [], vals: Object.fromEntries((r.values || []).map((x) => [x.key, x.value])) }])));
    setOverall(v.overallStatus);
    if (v.urgent) setUrgent({ reason: v.urgent.reason || '', notes: v.urgent.notes || '', recommendedEscalation: v.urgent.recommendedEscalation || '' });
    setFollowUp(!!v.followUpRequired);
    setFollowUpNotes(v.followUpNotes || '');
    if (v.draftSavedAt) setSave({ at: v.draftSavedAt });
  }, [v]);

  const fields = v?.form?.fields;
  const want = useMemo(() => new Map((fields?.vitals || []).map((x) => [x.key, x.required])), [fields]);
  const has = (k: string) => want.has(k as never);
  const req = (k: string) => !!want.get(k as never);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!vals) return e;
    if (!inRange(vals.sys, LIM.sys)) e.sys = 'Check systolic (50–260)';
    if (!inRange(vals.dia, LIM.dia)) e.dia = 'Check diastolic (30–160)';
    if (vals.sys && vals.dia && Number(vals.sys) <= Number(vals.dia)) e.dia = 'Systolic must be higher than diastolic';
    if (!inRange(vals.pulse, LIM.pulse)) e.pulse = 'Check pulse (20–250)';
    if (!inRange(vals.spo2, LIM.spo2)) e.spo2 = 'Check SpO₂ (50–100)';
    if (!inRange(vals.temp, vals.tUnit === 'C' ? LIM.tC : LIM.tF)) e.temp = vals.tUnit === 'C' ? 'Check temperature (32–43.5 °C)' : 'Check temperature (90–110 °F)';
    if (!inRange(vals.weight, LIM.weight)) e.weight = 'Check weight (20–250 kg)';
    if (!inRange(vals.sugar, LIM.sugar)) e.sugar = 'Check sugar (20–600)';
    return e;
  }, [vals]);

  const measurements = useMemo((): Measurements => {
    const m: Measurements = {};
    if (!vals) return m;
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
  const reports = templates.map((t) => ({
    templateId: t._id, name: t.name, kind: t.kind, reportDate: sheets[t._id]?.date || undefined,
    checked: t.kind === 'CHECKLIST' ? sh(t._id).checked : [],
    values: t.kind === 'TABLE' && mode === 'FORM' ? t.items.filter((i) => sh(t._id).vals[i.key]?.trim()).map((i) => ({ key: i.key, label: i.label, value: sh(t._id).vals[i.key].trim() })) : [],
  }));
  const urgentOk = urgent.reason.trim().length >= 3 && urgent.notes.trim().length >= 3 && !!urgent.recommendedEscalation;
  const payload = () => ({
    reportMode: mode, reports: reports.length ? reports : undefined, measurements, symptoms, symptomNotes: symptomNotes.trim() || undefined,
    medicationStatus: meds.length ? meds : undefined, mobility, wellbeing: Object.keys(wellbeing).length ? wellbeing : undefined, notes: notes.trim() || undefined,
    overallStatus: overall, urgent: overall === 'URGENT_ATTENTION' && urgentOk ? { ...urgent, reason: urgent.reason.trim(), notes: urgent.notes.trim() } : undefined,
    followUpRequired: followUp, followUpNotes: followUp ? followUpNotes.trim() || undefined : undefined,
  });
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const sig = JSON.stringify(payload());

  // Autosave 2.5 s after the last change
  useEffect(() => {
    if (!loaded.current || !vals) return;
    if (!dirty.current) { dirty.current = true; return; }
    const t = setTimeout(async () => {
      setSave((x) => ({ ...x, saving: true, failed: false }));
      try {
        const r = await patch<{ draftSavedAt: string }>(`/assistant/jobs/${jobId}/visit`, payloadRef.current());
        setSave({ at: r.data?.draftSavedAt });
      } catch { setSave((x) => ({ ...x, saving: false, failed: true })); }
    }, 2500);
    return () => clearTimeout(t);
  }, [sig, jobId, vals]);

  if (q.isLoading || (v && !vals)) return <Skeleton className="h-64 w-full" />;
  if (q.error || !v || !vals) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (v.status === 'COMPLETED') return <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm text-ink-soft">This visit is completed. Ask the care desk to correct a value.</p>;

  const set = (k: keyof Vals) => (e: { target: { value: string } }) => setVals((o) => (o ? { ...o, [k]: e.target.value } : o));
  const photos = v.media || [];
  const minPhotos = fields?.minPhotos || 0;
  const missing: string[] = [];
  if (req('bp') && !measurements.bp) missing.push('Blood pressure');
  if (req('pulse') && !measurements.pulse) missing.push('Pulse');
  if (req('spo2') && !measurements.spo2) missing.push('SpO₂');
  if (req('temperature') && !measurements.temperature) missing.push('Temperature');
  if (req('weight') && !measurements.weight) missing.push('Weight');
  if (req('bloodSugar') && !measurements.bloodSugar) missing.push('Blood sugar');
  if (photos.length < minPhotos) missing.push(`${minPhotos - photos.length} more photo(s)`);
  if (hasTable && mode === 'IMAGE' && !photos.some((m) => m.type === 'TEST_REPORT')) missing.push('Report image (photo type: Test report)');
  if (!overall) missing.push('Overall status');
  if (overall === 'URGENT_ATTENTION' && !urgentOk) missing.push('Urgent details');
  const hasErrors = Object.keys(errors).length > 0;
  const refresh = () => { q.refetch(); qc.invalidateQueries({ queryKey: ['assistant', 'job', jobId] }); };

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setUp((u) => ({ ...u, busy: true }));
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('type', up.type);
        if (up.caption.trim()) form.append('caption', up.caption.trim());
        await http.post(`/assistant/jobs/${jobId}/visit/media`, form);
      }
      await q.refetch();
      toast.success('Added');
      setUp((u) => ({ ...u, caption: '' }));
    } catch (e) {
      toast.error('Upload failed', (e as Error).message);
    } finally {
      setUp((u) => ({ ...u, busy: false }));
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function removePhoto(id: string) {
    if (!window.confirm('Remove this photo? It will not be part of the report.')) return;
    try { await http.delete(`/assistant/jobs/${jobId}/visit/media/${id}`); refresh(); } catch (e) { toast.error('Could not remove', (e as Error).message); }
  }
  async function complete() {
    setServerError(null);
    setCompleting(true);
    const name = `visit-complete-key:${jobId}`;
    let key = '';
    try { key = sessionStorage.getItem(name) || ''; } catch { /* ignore */ }
    if (!key) { key = crypto.randomUUID(); try { sessionStorage.setItem(name, key); } catch { /* ignore */ } }
    try {
      await http.post(`/assistant/jobs/${jobId}/visit/complete`, { ...payload(), confirm: true }, { headers: { 'Idempotency-Key': key } });
      try { sessionStorage.removeItem(name); } catch { /* ignore */ }
      ['assistant'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setReview(false);
      toast.success('Visit completed', 'The report has been sent to the family.');
      onDone();
    } catch (e) {
      setServerError((e as Error).message || 'Could not complete. Check your connection and try again.');
    } finally {
      setCompleting(false);
    }
  }

  const num = (label: string, k: keyof Vals, unit: string, ph?: string, err?: string, required?: boolean) => (
    <Field label={`${label} (${unit})${required ? ' *' : ''}`} error={err}><Input type="number" inputMode="decimal" value={vals[k]} onChange={set(k)} placeholder={ph} /></Field>
  );
  const sectionNote = 'text-sm text-ink-muted';
  const summary: [string, string][] = [];
  if (measurements.bp) summary.push(['Blood pressure', `${measurements.bp.systolic}/${measurements.bp.diastolic}`]);
  if (measurements.pulse) summary.push(['Pulse', `${measurements.pulse} bpm`]);
  if (measurements.spo2) summary.push(['SpO₂', `${measurements.spo2}%`]);
  if (measurements.temperature) summary.push(['Temperature', `${measurements.temperature.value} °${measurements.temperature.unit}`]);
  if (measurements.weight) summary.push(['Weight', `${measurements.weight.value} kg`]);
  if (measurements.bloodSugar) summary.push(['Blood sugar', `${measurements.bloodSugar.value} mg/dL`]);

  return (
    <div className="space-y-5 pb-28">
      <p className={sectionNote}>Record what you measure and observe. Do not diagnose. If something seems wrong, mark it as needing attention.</p>

      {!!fields?.vitals?.length && (
        <Panel title="Measurements">
          <div className="grid gap-x-4 sm:grid-cols-2">
            {has('bp') && (
              <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                {num('Systolic', 'sys', 'mmHg', '120', errors.sys, req('bp'))}
                {num('Diastolic', 'dia', 'mmHg', '80', errors.dia, req('bp'))}
              </div>
            )}
            {has('pulse') && num('Pulse', 'pulse', 'bpm', '72', errors.pulse, req('pulse'))}
            {has('spo2') && num('SpO₂', 'spo2', '%', '98', errors.spo2, req('spo2'))}
            {has('temperature') && (
              <div>
                {num('Temperature', 'temp', vals.tUnit === 'F' ? '°F' : '°C', vals.tUnit === 'F' ? '98.6' : '37', errors.temp, req('temperature'))}
                <div className="-mt-2 mb-3 flex gap-2">{(['F', 'C'] as const).map((u) => <Chip key={u} on={vals.tUnit === u} onClick={() => setVals({ ...vals, tUnit: u })}>°{u}</Chip>)}</div>
              </div>
            )}
            {has('weight') && num('Weight', 'weight', 'kg', undefined, errors.weight, req('weight'))}
            {has('bloodSugar') && (
              <div>
                {num('Blood sugar', 'sugar', 'mg/dL', undefined, errors.sugar, req('bloodSugar'))}
                <div className="-mt-2 mb-3 flex flex-wrap gap-2">{['FASTING', 'RANDOM', 'POST_MEAL'].map((c) => <Chip key={c} on={vals.sugarCtx === c} onClick={() => setVals({ ...vals, sugarCtx: c })}>{c === 'POST_MEAL' ? 'After meal' : humanize(c)}</Chip>)}</div>
              </div>
            )}
          </div>
        </Panel>
      )}

      {fields?.collectSymptoms !== false && (
        <Panel title="Symptoms they mention">
          <div className="flex flex-wrap gap-2">{(v.form?.symptomsList?.length ? v.form.symptomsList : SYMPTOMS).map((x) => <Chip key={x} on={symptoms.includes(x)} onClick={() => setSymptoms(symptoms.includes(x) ? symptoms.filter((y) => y !== x) : [...symptoms, x])}>{x}</Chip>)}</div>
          <div className="mt-4"><Field label="In their words (optional)"><Textarea rows={2} value={symptomNotes} onChange={(e) => setSymptomNotes(e.target.value)} placeholder="e.g. Knee pain since two days, worse on stairs" /></Field></div>
        </Panel>
      )}

      {fields?.collectMedication !== false && meds.length > 0 && (
        <Panel title="Medicines check" bodyClass="p-0 divide-y divide-line">
          {meds.map((m, i) => (
            <div key={`${m.medicineName}-${m.slot}`} className="px-5 py-3">
              <p className="font-semibold">{m.medicineName} <span className="text-sm font-normal text-ink-muted">· {humanize(m.slot)}</span></p>
              <div className="mt-2 flex flex-wrap gap-2">{['TAKEN', 'MISSED', 'NOT_DUE', 'UNKNOWN'].map((st) => <Chip key={st} on={m.status === st} onClick={() => setMeds(meds.map((x, j) => (j === i ? { ...x, status: st } : x)))}>{st === 'UNKNOWN' ? "Don't know" : humanize(st)}</Chip>)}</div>
            </div>
          ))}
        </Panel>
      )}

      {fields?.collectMobility && (
        <Panel title="Moving around">
          <div className="flex flex-wrap gap-2">{[['INDEPENDENT', 'On their own'], ['NEEDS_SUPPORT', 'Needs support'], ['ASSISTED_DEVICE', 'Walker / stick'], ['BEDRIDDEN', 'Bedridden']].map(([k, l]) => <Chip key={k} on={mobility === k} onClick={() => setMobility(k)}>{l}</Chip>)}</div>
        </Panel>
      )}

      {fields?.collectWellbeing && (
        <Panel title="Wellbeing">
          {([['appetite', 'Appetite', ['GOOD', 'REDUCED', 'POOR']], ['sleep', 'Sleep', ['GOOD', 'DISTURBED', 'POOR']], ['mood', 'Mood', ['CHEERFUL', 'CALM', 'LOW', 'ANXIOUS', 'CONFUSED']], ['hydration', 'Drinking water', ['ADEQUATE', 'LOW']]] as const).map(([k, label, opts]) => (
            <Field key={k} label={label}><div className="flex flex-wrap gap-2">{opts.map((o) => <Chip key={o} on={wellbeing[k] === o} onClick={() => setWellbeing({ ...wellbeing, [k]: o })}>{humanize(o)}</Chip>)}</div></Field>
          ))}
        </Panel>
      )}

      {templates.map((t, ti) => {
        const s = sh(t._id);
        const term = search.trim().toLowerCase();
        const shown = t.items.filter((i) => !term || i.label.toLowerCase().includes(term));
        const filled = t.kind === 'CHECKLIST' ? s.checked.length : t.items.filter((i) => s.vals[i.key]?.trim()).length;
        const firstTable = t.kind === 'TABLE' && templates.findIndex((x) => x.kind === 'TABLE') === ti;
        return (
          <Panel key={t._id} title={t.name}>
            {t.items.length > 6 && (
              <div className="mb-4">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tests" />
                <p className="mt-1 text-xs text-ink-muted">{filled} of {t.items.length} {t.kind === 'CHECKLIST' ? 'done' : 'filled'}{term ? ` · ${shown.length} match` : ''}</p>
              </div>
            )}
            {t.kind === 'CHECKLIST' ? (
              <>
                <div className="flex flex-wrap gap-2">{shown.map((i) => <Chip key={i.key} on={s.checked.includes(i.label)} onClick={() => patchSheet(t._id, { checked: s.checked.includes(i.label) ? s.checked.filter((y) => y !== i.label) : [...s.checked, i.label] })}>{i.label}</Chip>)}</div>
                <p className="mt-3 text-xs text-ink-muted">{s.checked.length} selected. Tap everything performed during this visit.</p>
              </>
            ) : (
              <>
                {firstTable && <div className="mb-4 inline-flex rounded-lg border border-line-strong p-0.5">{([['FORM', 'Fill values'], ['IMAGE', 'Upload image']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setMode(k)} className={cn('rounded-md px-4 py-2 text-sm font-semibold', mode === k ? 'bg-brand text-white' : 'text-ink-soft')}>{l}</button>)}</div>}
                {mode === 'FORM' ? (
                  <div className="space-y-3">
                    <Field label="Report date"><Input type="date" max={new Date().toISOString().split('T')[0]} value={s.date || new Date().toISOString().split('T')[0]} onChange={(e) => patchSheet(t._id, { date: e.target.value })} /></Field>
                    <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                      {shown.map((i) => <Field key={i.key} label={i.label}><Input value={s.vals[i.key] || ''} onChange={(e) => patchSheet(t._id, { vals: { ...s.vals, [i.key]: e.target.value } })} placeholder="Empty = not tested" /></Field>)}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-lg bg-brand-soft p-4 text-sm text-ink-soft">
                    <p className="font-semibold">Upload the report as an image</p>
                    <p>Add a photo or scan below using the type “Test report”. Make sure all values are readable.</p>
                    <Button size="sm" onClick={() => { setUp((u) => ({ ...u, type: 'TEST_REPORT' })); setTimeout(() => fileRef.current?.click(), 0); }}><Camera className="h-4 w-4" /> Add report image</Button>
                    <p className="text-xs">{photos.filter((m) => m.type === 'TEST_REPORT').length} report image(s) added.</p>
                  </div>
                )}
              </>
            )}
          </Panel>
        );
      })}

      <Panel title={`Photos and documents${minPhotos ? ` (at least ${minPhotos})` : ''}`}>
        <div className="flex flex-wrap gap-3">
          {photos.map((m) => (
            <div key={m._id} className="relative w-28">
              <a href={m.url} target="_blank" rel="noreferrer">
                {m.mime.startsWith('image/') ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.url} alt={m.caption || humanize(m.type)} className="h-28 w-28 rounded-lg border border-line object-cover" /> : <span className="flex h-28 w-28 items-center justify-center rounded-lg border border-line bg-canvas text-sm">PDF</span>}
              </a>
              <button type="button" onClick={() => removePhoto(m._id)} aria-label="Remove photo" className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-white"><Trash2 className="h-4 w-4" /></button>
              <p className="mt-1 truncate text-xs text-ink-muted">{humanize(m.type)}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          <Field label="What is it?"><div className="flex flex-wrap gap-2">{MEDIA.map(([k, l]) => <Chip key={k} on={up.type === k} onClick={() => setUp((u) => ({ ...u, type: k }))}>{l}</Chip>)}</div></Field>
          <Field label="Caption (optional)"><Input value={up.caption} onChange={(e) => setUp((u) => ({ ...u, caption: e.target.value }))} /></Field>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple capture={undefined} className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <Button variant="secondary" loading={up.busy} onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" /> Add photo / file</Button>
          <p className="text-xs text-ink-muted">Photograph prescriptions, medicine strips or reports. Avoid faces unless needed.</p>
        </div>
      </Panel>

      <Panel title="Your observations">
        <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you notice? How were they today?" />
      </Panel>

      <Panel title="Overall">
        <div className="grid gap-2">
          {OVERALL.map(([k, l, tone]) => <button key={k} type="button" onClick={() => setOverall(k)} aria-pressed={overall === k} className={cn('rounded-xl border-2 px-4 py-3 text-left font-semibold', overall === k ? tone : 'border-line bg-white')}>{l}</button>)}
        </div>
        {overall === 'URGENT_ATTENTION' && (
          <div className="mt-4 space-y-3 rounded-xl border border-danger/30 bg-danger-soft/60 p-4">
            <p className="font-semibold text-danger">The care desk and family are alerted immediately when you complete. If life is at risk, call your local emergency number now.</p>
            <Field label="What is the concern? *"><Input value={urgent.reason} onChange={(e) => setUrgent({ ...urgent, reason: e.target.value })} placeholder="e.g. BP very high, chest discomfort" /></Field>
            <Field label="Details *"><Textarea rows={3} value={urgent.notes} onChange={(e) => setUrgent({ ...urgent, notes: e.target.value })} /></Field>
            <Field label="Suggested next step *"><div className="flex flex-wrap gap-2">{ESC.map((e) => <Chip key={e} on={urgent.recommendedEscalation === e} onClick={() => setUrgent({ ...urgent, recommendedEscalation: e })}>{humanize(e)}</Chip>)}</div></Field>
          </div>
        )}
        <label className="mt-4 flex items-start gap-3 text-[15px]"><input type="checkbox" className="mt-1 h-5 w-5" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} /><span><span className="font-semibold">Suggest a follow-up</span><br /><span className="text-sm text-ink-muted">e.g. a doctor visit or a test</span></span></label>
        {followUp && <div className="mt-3"><Textarea rows={2} value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} placeholder="What should the family arrange?" /></div>}
      </Panel>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">{save.saving ? 'Saving…' : save.failed ? 'Not saved: no connection. Will retry on the next change.' : save.at ? `Draft saved ${new Date(save.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Changes save automatically'}</p>
          <Button disabled={hasErrors} onClick={() => setReview(true)}><CheckCheck className="h-4 w-4" /> Review and complete</Button>
        </div>
      </div>

      <Dialog open={review} onClose={() => setReview(false)} title="Check before sending" description="After completing, only the care desk can change values. The family receives the report right away."
        footer={<><Button variant="secondary" onClick={() => setReview(false)}>Back</Button><Button onClick={complete} loading={completing} disabled={missing.length > 0}>Complete and send report</Button></>}>
        {missing.length > 0 && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Still needed: {missing.join(', ')}</p>}
        {serverError && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{serverError}</p>}
        <dl className="space-y-1.5 text-[15px]">
          {summary.map(([k, val]) => <div key={k} className="flex justify-between gap-3"><dt className="text-ink-muted">{k}</dt><dd className="font-semibold">{val}</dd></div>)}
          {symptoms.length > 0 && <p className="text-ink-muted">Symptoms: {symptoms.join(', ')}</p>}
          <p className="text-ink-muted">Photos: {photos.length}</p>
          {overall && <p className="font-semibold">Overall: {humanize(overall)}</p>}
        </dl>
      </Dialog>
    </div>
  );
}
