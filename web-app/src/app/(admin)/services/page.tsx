'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Clock, Camera } from 'lucide-react';
import { get, patch, post, del } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn, humanize, inr } from '@/lib/utils';
import { ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Badge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { ListPager, SearchBar, useClientList } from '@/components/ui/list-controls';

const VITALS = [
  ['bp', 'Blood pressure'],
  ['pulse', 'Pulse'],
  ['spo2', 'SpO₂'],
  ['temperature', 'Temperature'],
  ['weight', 'Weight'],
  ['bloodSugar', 'Blood sugar'],
] as const;

type Service = {
  _id: string; name: string; slug: string; description?: string; basePrice: number; durationMinutes: number; recurringDiscountPercent: number; isActive: boolean; sortOrder: number; bookingsCount: number;
  fields: { vitals: { key: string; required: boolean }[]; collectSymptoms: boolean; collectMedication: boolean; collectMobility: boolean; collectWellbeing: boolean; minPhotos: number; dailyChecklist?: boolean; labPanel?: 'NONE' | 'HAEMATOLOGY' };
  sheetKind?: 'NONE' | 'CHECKLIST' | 'TABLE'; items?: { key: string; label: string }[];
};

export default function ServicesPage() {
  const q = useQuery({ queryKey: ['services'], queryFn: () => get<Service[]>('/admin/services') });
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const list = useClientList(q.data, (s) => `${s.name} ${s.description || ''}`, 12);
  return (
    <>
      <PageHeader title="Services" subtitle="Parent services and the child items under each. Assign them to a client from the customer page." actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />New service</Button>} />
      <SearchBar value={list.q} onChange={list.setQ} placeholder="Search services" />
      {q.isError && <ErrorState error={q.error} />}
      {q.isLoading && <Skeleton className="h-60" />}
      <div className="grid gap-4 lg:grid-cols-2">
        {list.rows.map((s) => (
          <article key={s._id} className={cn('panel flex flex-col p-5', !s.isActive && 'opacity-70')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{s.name}</h2>
                <p className="mt-0.5 flex items-center gap-3 text-sm text-ink-muted">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{s.durationMinutes} min</span>
                  {s.fields.minPhotos > 0 && <span className="inline-flex items-center gap-1"><Camera className="h-3.5 w-3.5" />{s.fields.minPhotos}+ photo</span>}
                  <span>{s.bookingsCount} booked</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold">{inr(s.basePrice)}</p>
                {s.recurringDiscountPercent > 0 && <p className="text-sm text-ok">{s.recurringDiscountPercent}% off on plans</p>}
              </div>
            </div>
            {s.description && <p className="mt-3 text-[15px] text-ink-soft">{s.description}</p>}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {s.fields.vitals.map((v) => (
                <Badge key={v.key} tone={v.required ? 'brand' : 'neutral'}>{VITALS.find(([k]) => k === v.key)?.[1]}{v.required ? '' : ' (optional)'}</Badge>
              ))}
              {!!s.items?.length && <Badge tone="ok">{s.items.length} child items</Badge>}
              {s.fields.collectMobility && <Badge>Mobility</Badge>}
              {s.fields.collectWellbeing && <Badge>Wellbeing</Badge>}
            </div>
            <div className="mt-auto flex items-center justify-between pt-5">
              {s.isActive ? <Badge tone="ok" dot>Bookable</Badge> : <Badge>Hidden from families</Badge>}
              <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>Edit</Button>
            </div>
          </article>
        ))}
      </div>
      <div className="panel mt-4"><ListPager meta={list.meta} onPage={list.setPage} /></div>
      {editing && <ServiceDialog service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ServiceDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const [f, setF] = useState(() => ({
    name: service?.name || '',
    slug: service?.slug || '',
    description: service?.description || '',
    price: service ? String(service.basePrice / 100) : '',
    durationMinutes: String(service?.durationMinutes || 60),
    recurringDiscountPercent: String(service?.recurringDiscountPercent ?? 10),
    sortOrder: String(service?.sortOrder ?? 0),
    isActive: service?.isActive ?? true,
    vitals: Object.fromEntries(VITALS.map(([k]) => [k, service?.fields.vitals.find((v) => v.key === k)?.required === false ? 'optional' : service?.fields.vitals.some((v) => v.key === k) ? 'required' : 'off'])) as Record<string, 'off' | 'required' | 'optional'>,
    collectSymptoms: service?.fields.collectSymptoms ?? true,
    collectMedication: service?.fields.collectMedication ?? true,
    collectMobility: service?.fields.collectMobility ?? false,
    collectWellbeing: service?.fields.collectWellbeing ?? false,
    minPhotos: String(service?.fields.minPhotos ?? 0),
    sheetKind: service?.sheetKind ?? 'NONE',
    items: (service?.items ?? []).map((i) => i.label).join('\n'),
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const body = {
    name: f.name.trim(),
    slug: f.slug.trim() || f.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    description: f.description.trim() || undefined,
    basePrice: Math.round(Number(f.price) * 100),
    durationMinutes: Number(f.durationMinutes),
    recurringDiscountPercent: Number(f.recurringDiscountPercent),
    sortOrder: Number(f.sortOrder),
    isActive: f.isActive,
    sheetKind: f.sheetKind,
    items: f.sheetKind === 'NONE' ? [] : f.items.split('\n').map((x) => x.trim()).filter(Boolean),
    fields: {
      vitals: [],
      collectSymptoms: false,
      collectMedication: false,
      collectMobility: false,
      collectWellbeing: false,
      minPhotos: Number(f.minPhotos),
      dailyChecklist: false,
      labPanel: 'NONE',
    },
  };
  const save = useAction(() => (service ? patch(`/admin/services/${service._id}`, body) : post('/admin/services', body)), { success: service ? 'Service updated' : 'Service created', invalidate: [['services']], onDone: onClose });
  const hide = useAction(() => del(`/admin/services/${service!._id}`), { success: (r) => `Hidden from new bookings${(r as { data?: { pendingBookings?: number } }).data?.pendingBookings ? ` · ${(r as { data: { pendingBookings: number } }).data.pendingBookings} existing visits unaffected` : ''}`, invalidate: [['services']], onDone: onClose });
  const valid = body.name.length >= 2 && body.basePrice >= 0 && !Number.isNaN(body.basePrice) && f.price !== '' && body.durationMinutes >= 15;

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title={service ? `Edit ${service.name}` : 'New service'}
      description="Price changes apply to new bookings only. Existing visits keep the price and form they were booked with."
      footer={
        <>
          {service?.isActive && <Button variant="danger" className="mr-auto" onClick={() => hide.mutate(undefined)} loading={hide.isPending}>Hide from families</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid}>Save</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="URL slug" hint="Lowercase and dashes; auto-filled from the name."><Input value={f.slug} onChange={(e) => set('slug', e.target.value)} placeholder="basic-health-check" /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Price (INR)"><Input inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
        <Field label="Duration (minutes)"><Input type="number" min={15} max={480} step={15} value={f.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} /></Field>
        <Field label="Recurring plan discount (%)"><Input type="number" min={0} max={50} value={f.recurringDiscountPercent} onChange={(e) => set('recurringDiscountPercent', e.target.value)} /></Field>
        <Field label="Minimum photos per visit"><Input type="number" min={0} max={10} value={f.minPhotos} onChange={(e) => set('minPhotos', e.target.value)} /></Field>
      </div>
      <details className="mt-6 rounded-lg border border-line p-4" open={f.sheetKind !== 'NONE'}>
      <summary className="cursor-pointer font-semibold">Advanced: paper sheet / checklist <span className="font-normal text-ink-muted">(optional — leave closed if this service needs none)</span></summary>
      <div className="mt-3">
      <p className="mb-2 text-sm text-ink-muted">Use this only if the visit follows a printed sheet (e.g. a daily entry sheet). Checklist = assistant ticks each item done; Values = assistant types a value per row or uploads a photo of the report. When you assign the service to a client you tick which items apply, and the visiting assistant sees only those.</p>
      <div className="mb-2 flex gap-2">
        {([['NONE', 'No sheet'], ['CHECKLIST', 'Checklist (tick done)'], ['TABLE', 'Values or report image']] as const).map(([k, label]) => (
          <Button key={k} size="sm" variant={f.sheetKind === k ? 'primary' : 'secondary'} onClick={() => set('sheetKind', k)}>{label}</Button>
        ))}
      </div>
      {f.sheetKind !== 'NONE' && (
        <Field label={`Child items (${f.items.split('\n').filter((x) => x.trim()).length})`} hint="One per line, same order as the paper sheet. Add or remove lines any time; past reports are not changed.">
          <Textarea rows={10} value={f.items} onChange={(e) => set('items', e.target.value)} placeholder={'GRBS\nABG\nECG'} />
        </Field>
      )}
      </div>
      </details>
    </Dialog>
  );
}
