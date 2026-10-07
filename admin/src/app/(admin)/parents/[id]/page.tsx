'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Phone } from 'lucide-react';
import { get } from '@/lib/api';
import { dateOnly, dateTime, humanize } from '@/lib/utils';
import { ErrorState, KeyVal, PageHeader, Panel, Skeleton, Tabs } from '@/components/ui/misc';
import { Badge, BookingBadge, OverallBadge } from '@/components/ui/status';
import { SheetDownload } from '@/components/people/sheet-download';

type Detail = {
  parent: {
    _id: string; fullName: string; age: number; gender: string; dateOfBirth: string; bloodGroup: string; mobile?: string; relationToOwner?: string;
    address: { line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string };
    medicalConditions: string[]; allergies: string[]; medicines: { name: string; dosage?: string; schedule?: Record<string, boolean>; notes?: string }[];
    emergencyContacts: { name: string; relation?: string; mobile: string }[]; specialInstructions?: string; lastOverallStatus?: never; lastVisitAt?: string; ownerId?: { _id: string; name: string; email: string };
  };
  family: { _id: string; userId?: { _id: string; name: string; email: string }; invitedEmail?: string; relation?: string; permissions: string[]; isOwner: boolean; status: string }[];
  bookings: { _id: string; bookingNumber: string; scheduledAt: string; status: never; serviceSnapshot: { name: string }; assistantId?: { name: string } }[];
  reports: { _id: string; reportNumber: string; visitDate: string; overallStatus: never; serviceName: string; version: number; followUpRequired?: boolean }[];
  measurements: { type: string; value: number; unit: string; context?: string; recordedAt: string }[];
};

type Metric = 'BP' | 'PULSE' | 'SPO2' | 'BLOOD_SUGAR' | 'WEIGHT' | 'TEMPERATURE';
const METRICS: { value: Metric; label: string; unit: string }[] = [
  { value: 'BP', label: 'Blood pressure', unit: 'mmHg' },
  { value: 'PULSE', label: 'Pulse', unit: 'bpm' },
  { value: 'SPO2', label: 'SpO₂', unit: '%' },
  { value: 'BLOOD_SUGAR', label: 'Blood sugar', unit: 'mg/dL' },
  { value: 'WEIGHT', label: 'Weight', unit: 'kg' },
  { value: 'TEMPERATURE', label: 'Temperature', unit: '°F' },
];

export default function ParentPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['parent', id], queryFn: () => get<Detail>(`/admin/parents/${id}`) });
  const [metric, setMetric] = useState<Metric>('BP');

  const series = useMemo(() => {
    const m = q.data?.measurements || [];
    const byTime = new Map<string, Record<string, number | string>>();
    const want = metric === 'BP' ? ['BP_SYSTOLIC', 'BP_DIASTOLIC'] : [metric];
    m.filter((x) => want.includes(x.type)).forEach((x) => {
      const row = byTime.get(x.recordedAt) || { t: dateOnly(x.recordedAt) };
      row[x.type] = x.value;
      byTime.set(x.recordedAt, row);
    });
    return [...byTime.values()];
  }, [q.data, metric]);

  if (q.isLoading) return <Skeleton className="h-80" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { parent: p, family, bookings, reports } = q.data;
  const meta = METRICS.find((x) => x.value === metric)!;
  const available = new Set(q.data.measurements.map((x) => (x.type.startsWith('BP_') ? 'BP' : x.type)));

  return (
    <>
      <PageHeader
        back={{ href: '/parents', label: 'Parents' }}
        title={p.fullName}
        subtitle={<span className="flex flex-wrap items-center gap-3">{p.age} yrs · {humanize(p.gender)} · {p.bloodGroup} · {p.address.city}<OverallBadge status={p.lastOverallStatus} /></span>}
      />
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <SheetDownload parentId={p._id} />
          <Panel title="Recorded trends" bodyClass="pt-2">
            <Tabs value={metric} onChange={setMetric} items={METRICS.filter((m) => available.has(m.value)).map((m) => ({ value: m.value, label: m.label }))} />
            <div className="mt-4 h-64">
              {series.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid vertical={false} stroke="#E3E6EA" />
                    <XAxis dataKey="t" tickLine={false} axisLine={false} tick={{ fill: '#8A929C', fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} width={36} domain={['auto', 'auto']} tick={{ fill: '#8A929C', fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E3E6EA', fontSize: 13 }} formatter={(v: number) => `${v} ${meta.unit}`} />
                    {metric === 'BP' ? (
                      <>
                        <Line type="monotone" dataKey="BP_SYSTOLIC" name="Systolic" stroke="#C8352E" strokeWidth={2.5} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="BP_DIASTOLIC" name="Diastolic" stroke="#1F2328" strokeWidth={2} dot={{ r: 3 }} />
                      </>
                    ) : (
                      <Line type="monotone" dataKey={metric} name={meta.label} stroke="#C8352E" strokeWidth={2.5} dot={{ r: 4 }} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-20 text-center text-ink-muted">No readings recorded yet.</p>
              )}
            </div>
            <p className="mt-2 text-xs text-ink-faint">Readings recorded by care assistants at home visits. Not a diagnosis.</p>
          </Panel>

          <Panel title="Reports" bodyClass="p-0">
            <ul>
              {reports.map((r) => (
                <li key={r._id} className="border-b border-line last:border-0">
                  <Link href={`/reports/${r._id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas/70">
                    <span>
                      <span className="font-medium">{r.serviceName}</span>
                      <span className="block text-sm text-ink-muted">{r.reportNumber}{r.version > 1 ? ` v${r.version}` : ''} · {dateTime(r.visitDate)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {r.followUpRequired && <Badge tone="warn">Follow-up</Badge>}
                      <OverallBadge status={r.overallStatus} />
                    </span>
                  </Link>
                </li>
              ))}
              {!reports.length && <li className="px-5 py-6 text-ink-muted">No reports yet.</li>}
            </ul>
          </Panel>

          <Panel title="Visits" bodyClass="p-0" action={<Link href={`/bookings?parentId=${p._id}`} className="link text-sm">All</Link>}>
            <ul>
              {bookings.map((b) => (
                <li key={b._id} className="border-b border-line last:border-0">
                  <Link href={`/bookings/${b._id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas/70">
                    <span>
                      {b.serviceSnapshot.name}
                      <span className="block text-sm text-ink-muted">{dateTime(b.scheduledAt)} · {b.assistantId?.name || 'No assistant'}</span>
                    </span>
                    <BookingBadge status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Care profile">
            <KeyVal
              cols={1}
              items={[
                ['Address', `${[p.address.line1, p.address.line2, p.address.landmark].filter(Boolean).join(', ')}, ${p.address.city}, ${p.address.state} ${p.address.pincode}`],
                ['Phone', p.mobile ? <a key="m" href={`tel:${p.mobile}`} className="link">{p.mobile}</a> : '—'],
                ['Conditions', p.medicalConditions.join(', ') || '—'],
                ['Allergies', p.allergies.length ? <span key="a" className="font-medium text-danger">{p.allergies.join(', ')}</span> : 'None recorded'],
                ['Special instructions', p.specialInstructions || '—'],
              ]}
            />
          </Panel>
          <Panel title="Medicines" bodyClass="p-0">
            <ul>
              {p.medicines.map((m, i) => (
                <li key={i} className="border-b border-line px-5 py-2.5 last:border-0">
                  <p className="font-medium">{m.name} <span className="font-normal text-ink-muted">{m.dosage}</span></p>
                  <p className="text-sm text-ink-muted">{Object.entries(m.schedule || {}).filter(([, v]) => v).map(([k]) => humanize(k)).join(', ') || 'As needed'}{m.notes ? ` · ${m.notes}` : ''}</p>
                </li>
              ))}
              {!p.medicines.length && <li className="px-5 py-4 text-ink-muted">None listed.</li>}
            </ul>
          </Panel>
          <Panel title="Emergency contacts">
            <ul className="space-y-2">
              {p.emergencyContacts.map((c) => (
                <li key={c.mobile}><a href={`tel:${c.mobile}`} className="flex items-center gap-2 hover:underline"><Phone className="h-4 w-4 text-brand" />{c.name} <span className="text-ink-muted">({c.relation || 'contact'})</span> {c.mobile}</a></li>
              ))}
            </ul>
          </Panel>
          <Panel title="Family access" bodyClass="p-0">
            <ul>
              {family.map((f) => (
                <li key={f._id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0">
                  <span>
                    {f.userId ? <Link href={`/customers/${f.userId._id}`} className="font-medium hover:underline">{f.userId.name}</Link> : <span className="font-medium">{f.invitedEmail}</span>}
                    <span className="block text-sm text-ink-muted">{f.isOwner ? 'Owner' : f.relation || 'Family'} · can {f.permissions.map((x) => x.toLowerCase()).join(', ')}</span>
                  </span>
                  {f.status === 'INVITED' && <Badge tone="warn">Invited</Badge>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
