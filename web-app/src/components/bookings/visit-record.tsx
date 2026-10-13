'use client';
import { useState } from 'react';
import { PencilLine, ImageIcon } from 'lucide-react';
import { get, post } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/lib/hooks';
import { dateTime, humanize } from '@/lib/utils';
import type { Measurements, Visit } from '@/lib/types';
import { Badge, OverallBadge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';

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

export function VisitRecord({ visit, readOnly }: { visit: Visit; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const svc = useQuery({ queryKey: ['services'], queryFn: () => get<{ _id: string; items?: { key: string; label: string }[] }[]>('/admin/services'), enabled: editing });
  const setD = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  // every test of each sheet, also the ones the assistant left empty
  const itemsOf = (r: NonNullable<Visit['reports']>[number]) => svc.data?.find((s) => s._id === r.templateId)?.items || (r.values || []).map((x) => ({ key: x.key, label: x.label }));
  const current = (r: NonNullable<Visit['reports']>[number], i: { key: string; label: string }) => (r.kind === 'CHECKLIST' ? ((r.checked || []).includes(i.label) ? 'Done' : 'Not done') : (r.values || []).find((x) => x.key === i.key)?.value || '');
  const changes = [
    ...(visit.reports || []).flatMap((r) => itemsOf(r).map((i) => ({ k: `t:${r.templateId}:${i.key}`, field: 'reportValue', newValue: { templateId: r.templateId, key: i.key, label: i.label, value: (draft[`t:${r.templateId}:${i.key}`] ?? '').trim() }, same: draft[`t:${r.templateId}:${i.key}`] === undefined || draft[`t:${r.templateId}:${i.key}`].trim() === current(r, i) }))),
    { k: 'notes', field: 'notes', newValue: draft.notes, same: draft.notes === undefined || draft.notes === (visit.notes || '') },
    { k: 'pulse', field: 'measurements.pulse', newValue: Number(draft.pulse), same: !draft.pulse || Number(draft.pulse) === visit.measurements?.pulse },
    { k: 'spo2', field: 'measurements.spo2', newValue: Number(draft.spo2), same: !draft.spo2 || Number(draft.spo2) === visit.measurements?.spo2 },
  ].filter((c) => !c.same);
  const save = useAction(async () => { for (const c of changes) await post(`/admin/health-visits/${visit._id}/correct`, { field: c.field, newValue: c.newValue, reason: reason.trim() }); }, {
    success: 'Saved — a new report version was issued and the family notified', invalidate: [['booking'], ['reports']], onDone: () => { setEditing(false); setDraft({}); setReason(''); },
  });
  const rows = vitalsRows(visit.measurements);
  const pending = visit.corrections?.filter((c) => c.status === 'REQUESTED') || [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <OverallBadge status={visit.overallStatus} />
        {visit.status === 'IN_PROGRESS' ? <Badge tone="brand" dot>Being recorded now</Badge> : <span className="text-sm text-ink-muted">Completed {dateTime(visit.completedAt)}</span>}
        {visit.version > 1 && <Badge tone="info">Corrected · v{visit.version}</Badge>}
        {!readOnly && visit.status === 'COMPLETED' && !editing && (
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setEditing(true)}>
            <PencilLine className="h-4 w-4" /> Edit results
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
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pulse (bpm)"><Input type="number" defaultValue={visit.measurements?.pulse ?? ''} onChange={(e) => setD('pulse', e.target.value)} /></Field>
            <Field label="SpO₂ (%)"><Input type="number" defaultValue={visit.measurements?.spo2 ?? ''} onChange={(e) => setD('spo2', e.target.value)} /></Field>
          </div>
        ) : rows.length ? (
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
          {editing ? (
            r.kind === 'CHECKLIST' ? (
              <div className="flex flex-wrap gap-1.5">
                {itemsOf(r).map((i) => {
                  const k = `t:${r.templateId}:${i.key}`;
                  const on = (draft[k] ?? current(r, i)) === 'Done';
                  return <button key={i.key} type="button" onClick={() => setD(k, on ? 'Not done' : 'Done')} className={on ? 'rounded-full border border-[#16a34a] bg-[#dcfce7] px-3 py-1 text-sm text-[#15803d]' : 'rounded-full border border-line px-3 py-1 text-sm text-ink-muted'}>{on ? '✓ ' : ''}{i.label}</button>;
                })}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {itemsOf(r).map((i) => <Field key={i.key} label={i.label}><Input defaultValue={current(r, i)} onChange={(e) => setD(`t:${r.templateId}:${i.key}`, e.target.value)} /></Field>)}
              </div>
            )
          ) : r.kind === 'CHECKLIST' ? (
            <div className="flex flex-wrap gap-1.5">{r.checked?.length ? r.checked.map((c) => <Badge key={c} tone="ok">{c}</Badge>) : <span className="text-sm text-ink-muted">Nothing ticked</span>}</div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[15px] sm:grid-cols-3">
              {r.values?.filter((x) => x.value).map((x) => <div key={x.key} className="flex justify-between gap-2 border-b border-line py-0.5"><dt className="text-ink-muted">{x.label}</dt><dd className="font-medium">{x.value}</dd></div>)}
            </dl>
          )}
        </div>
      ))}

      {editing ? (
        <Field label="Assistant observations"><Textarea defaultValue={visit.notes || ''} onChange={(e) => setD('notes', e.target.value)} /></Field>
      ) : visit.notes && (
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

      {pending.length > 0 && !readOnly && (
        <p className="text-sm text-warn">
          {pending.length} correction request{pending.length > 1 ? 's' : ''} waiting — review them on the Reports page.
        </p>
      )}
      <p className="text-xs text-ink-faint">Recorded measurements and observations from a home visit. Not a medical diagnosis.</p>
      {editing && (
        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-end gap-3 border-t border-line bg-white px-5 py-4">
          <div className="min-w-[220px] flex-1"><Field label="Reason for the change" hint={changes.length ? `${changes.length} change${changes.length > 1 ? 's' : ''} · the original report is kept` : 'Edit any value above'}><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Typing mistake by the assistant" /></Field></div>
          <Button variant="secondary" onClick={() => { setEditing(false); setDraft({}); setReason(''); }}>Cancel</Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!changes.length || reason.trim().length < 5}>Save changes</Button>
        </div>
      )}
    </div>
  );
}
