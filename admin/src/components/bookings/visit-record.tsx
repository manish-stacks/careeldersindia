'use client';
import { useState } from 'react';
import { PencilLine, ImageIcon } from 'lucide-react';
import { post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { dateTime, humanize } from '@/lib/utils';
import type { Measurements, Visit } from '@/lib/types';
import { Badge, OverallBadge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';

export function vitalsRows(m: Measurements = {}) {
  const rows: [string, string][] = [];
  if (m.bp?.systolic) rows.push(['Blood pressure', `${m.bp.systolic}/${m.bp.diastolic} mmHg`]);
  if (m.pulse) rows.push(['Pulse', `${m.pulse} bpm`]);
  if (m.spo2) rows.push(['SpO₂', `${m.spo2}%`]);
  if (m.temperature?.value) rows.push(['Temperature', `${m.temperature.value} °${m.temperature.unit || 'F'}`]);
  if (m.weight?.value) rows.push(['Weight', `${m.weight.value} kg`]);
  if (m.bloodSugar?.value) rows.push(['Blood sugar', `${m.bloodSugar.value} mg/dL (${humanize(m.bloodSugar.context)})`]);
  return rows;
}

const MED_TONE: Record<string, 'ok' | 'danger' | 'neutral'> = { TAKEN: 'ok', MISSED: 'danger', NOT_DUE: 'neutral', UNKNOWN: 'neutral' };

export function VisitRecord({ visit }: { visit: Visit }) {
  const [editing, setEditing] = useState(false);
  const rows = vitalsRows(visit.measurements);
  const pending = visit.corrections?.filter((c) => c.status === 'REQUESTED') || [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <OverallBadge status={visit.overallStatus} />
        {visit.status === 'IN_PROGRESS' ? <Badge tone="brand" dot>Being recorded now</Badge> : <span className="text-sm text-ink-muted">Completed {dateTime(visit.completedAt)}</span>}
        {visit.version > 1 && <Badge tone="info">Corrected · v{visit.version}</Badge>}
        {visit.status === 'COMPLETED' && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setEditing(true)}>
            <PencilLine className="h-4 w-4" /> Correct a value
          </Button>
        )}
      </div>

      {visit.overallStatus === 'URGENT_ATTENTION' && visit.urgent?.reason && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft/60 p-4">
          <p className="font-semibold text-danger">{visit.urgent.reason}</p>
          <p className="mt-1 text-[15px]">{visit.urgent.notes}</p>
          <p className="mt-1 text-sm text-ink-muted">Assistant recommended: {humanize(visit.urgent.recommendedEscalation)}</p>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink-soft">Recorded measurements</h3>
        {rows.length ? (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rows.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-canvas px-3 py-2">
                <dt className="text-sm text-ink-muted">{k}</dt>
                <dd className="text-lg font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-ink-muted">No measurements saved yet.</p>
        )}
      </div>

      {(visit.symptoms?.length || visit.symptomNotes) && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-ink-soft">Symptoms reported</h3>
          <div className="flex flex-wrap gap-1.5">{visit.symptoms?.map((s) => <Badge key={s}>{s}</Badge>)}</div>
          {visit.symptomNotes && <p className="mt-2 text-[15px]">{visit.symptomNotes}</p>}
        </div>
      )}

      {!!visit.medicationStatus?.length && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-ink-soft">Medicines (as reported)</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {visit.medicationStatus.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  {m.medicineName} <span className="text-sm text-ink-muted">· {humanize(m.slot)} · per {humanize(m.reportedBy)}</span>
                </span>
                <Badge tone={MED_TONE[m.status] || 'neutral'}>{humanize(m.status)}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(visit.mobility || (visit.wellbeing && Object.keys(visit.wellbeing).length > 0)) && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
          {visit.mobility && (
            <span>
              <span className="text-ink-muted">Mobility:</span> {humanize(visit.mobility)}
            </span>
          )}
          {Object.entries(visit.wellbeing || {}).map(([k, v]) => (
            <span key={k}>
              <span className="text-ink-muted">{humanize(k)}:</span> {humanize(v)}
            </span>
          ))}
        </div>
      )}

      {visit.reports?.map((r) => (
        <div key={r.templateId}>
          <h3 className="mb-1.5 text-sm font-semibold text-ink-soft">{r.name}{r.reportDate ? ` · ${r.reportDate}` : ''}</h3>
          {r.kind === 'CHECKLIST' ? (
            <div className="flex flex-wrap gap-1.5">{r.checked?.length ? r.checked.map((c) => <Badge key={c} tone="ok">{c}</Badge>) : <span className="text-sm text-ink-muted">Nothing ticked</span>}</div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[15px] sm:grid-cols-3">
              {r.values?.filter((x) => x.value).map((x) => <div key={x.key} className="flex justify-between gap-2 border-b border-line py-0.5"><dt className="text-ink-muted">{x.label}</dt><dd className="font-medium">{x.value}</dd></div>)}
            </dl>
          )}
        </div>
      ))}

      {visit.notes && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-ink-soft">Assistant observations</h3>
          <p className="whitespace-pre-line text-[15px]">{visit.notes}</p>
        </div>
      )}
      {visit.followUpRequired && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-[15px] text-warn">
          Follow-up suggested{visit.followUpNotes ? `: ${visit.followUpNotes}` : ''}
        </p>
      )}

      {!!visit.media?.length && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-soft">Photos</h3>
          <div className="flex flex-wrap gap-3">
            {visit.media.map((m) => (
              <a key={m._id} href={m.url} target="_blank" rel="noreferrer" className="group w-36">
                {m.mime.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.caption || humanize(m.type)} className="h-28 w-36 rounded-lg border border-line object-cover group-hover:border-ink-faint" />
                ) : (
                  <span className="flex h-28 w-36 items-center justify-center rounded-lg border border-line bg-canvas"><ImageIcon className="h-6 w-6 text-ink-faint" /></span>
                )}
                <span className="mt-1 line-clamp-2 block text-xs text-ink-muted">{m.caption || humanize(m.type)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <p className="text-sm text-warn">
          {pending.length} correction request{pending.length > 1 ? 's' : ''} waiting — review them on the Reports page.
        </p>
      )}
      <p className="text-xs text-ink-faint">Recorded measurements and observations from a home visit. Not a medical diagnosis.</p>
      {editing && <CorrectionDialog visit={visit} onClose={() => setEditing(false)} />}
    </div>
  );
}

const FIELDS = [
  ['measurements.bp', 'Blood pressure'],
  ['measurements.pulse', 'Pulse'],
  ['measurements.spo2', 'SpO₂'],
  ['measurements.temperature', 'Temperature'],
  ['measurements.weight', 'Weight'],
  ['measurements.bloodSugar', 'Blood sugar'],
  ['overallStatus', 'Overall status'],
  ['notes', 'Assistant observations'],
  ['symptomNotes', 'Symptom notes'],
  ['followUpRequired', 'Follow-up required'],
  ['followUpNotes', 'Follow-up notes'],
] as const;

function CorrectionDialog({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const [field, setField] = useState<string>('measurements.pulse');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [unit, setUnit] = useState('F');
  const [reason, setReason] = useState('');

  const value = (() => {
    switch (field) {
      case 'measurements.bp':
        return { systolic: Number(a), diastolic: Number(b) };
      case 'measurements.pulse':
      case 'measurements.spo2':
        return Number(a);
      case 'measurements.temperature':
        return { value: Number(a), unit };
      case 'measurements.weight':
        return { value: Number(a), unit: 'KG' };
      case 'measurements.bloodSugar':
        return { value: Number(a), unit: 'mg/dL', context: b || 'RANDOM' };
      case 'followUpRequired':
        return a === 'true';
      default:
        return a;
    }
  })();

  const save = useAction(() => post(`/admin/health-visits/${visit._id}/correct`, { field, newValue: value, reason }), {
    success: 'Correction applied — a new report version was issued and the family notified',
    invalidate: [['booking'], ['reports']],
    onDone: onClose,
  });

  const numeric = ['measurements.pulse', 'measurements.spo2', 'measurements.weight', 'measurements.temperature', 'measurements.bloodSugar', 'measurements.bp'].includes(field);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Correct a recorded value"
      description="The original report is kept. A new version is generated and the family is told it changed."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={reason.trim().length < 5 || (numeric && !a)}>
            Apply correction
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Field">
          <Select value={field} onChange={(e) => { setField(e.target.value); setA(''); setB(''); }}>
            {FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        {field === 'measurements.bp' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Systolic"><Input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} /></Field>
            <Field label="Diastolic"><Input inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} /></Field>
          </div>
        )}
        {['measurements.pulse', 'measurements.spo2', 'measurements.weight'].includes(field) && (
          <Field label="New value"><Input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        )}
        {field === 'measurements.temperature' && (
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Temperature"><Input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} /></Field>
            <Field label="Unit"><Select value={unit} onChange={(e) => setUnit(e.target.value)}><option value="F">°F</option><option value="C">°C</option></Select></Field>
          </div>
        )}
        {field === 'measurements.bloodSugar' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="mg/dL"><Input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} /></Field>
            <Field label="Taken">
              <Select value={b || 'RANDOM'} onChange={(e) => setB(e.target.value)}><option value="FASTING">Fasting</option><option value="RANDOM">Random</option><option value="POST_MEAL">After meal</option></Select>
            </Field>
          </div>
        )}
        {field === 'overallStatus' && (
          <Field label="Overall status">
            <Select value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">Choose…</option>
              <option value="STABLE">Stable</option>
              <option value="NEEDS_ATTENTION">Needs attention</option>
              <option value="URGENT_ATTENTION">Urgent attention</option>
            </Select>
          </Field>
        )}
        {field === 'followUpRequired' && (
          <Field label="Follow-up required">
            <Select value={a} onChange={(e) => setA(e.target.value)}><option value="true">Yes</option><option value="false">No</option></Select>
          </Field>
        )}
        {['notes', 'symptomNotes', 'followUpNotes'].includes(field) && (
          <Field label="New text"><Textarea value={a} onChange={(e) => setA(e.target.value)} /></Field>
        )}
        <Field label="Reason for correction" hint="Visible in the audit log.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Assistant confirmed pulse was 76, typed 67" />
        </Field>
      </div>
    </Dialog>
  );
}
