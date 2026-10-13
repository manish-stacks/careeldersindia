'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw } from 'lucide-react';
import { get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { dateTime, humanize } from '@/lib/utils';
import type { Visit } from '@/lib/types';
import { ErrorState, KeyVal, PageHeader, Panel, Skeleton } from '@/components/ui/misc';
import { Badge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { VisitRecord } from '@/components/bookings/visit-record';

type Report = {
  _id: string; reportNumber: string; version: number; bookingId: string; visitDate: string; serviceName: string; overallStatus: string; createdAt: string;
  pdf?: { status: string; error?: string; generatedAt?: string };
  data: Omit<Visit, '_id' | 'status' | 'startedAt' | 'version'> & { patient: { name: string; age?: number; gender?: string; bloodGroup?: string; city: string }; visit: { bookingNumber: string; startedAt: string; completedAt: string }; assistant: { name: string }; disclaimer: string; followUp?: { required: boolean; notes?: string } };
  media: Visit['media'];
  versions: { _id: string; version: number; reportNumber: string; createdAt: string }[];
};

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['report', id], queryFn: () => get<Report>(`/admin/reports/${id}`) });
  const pdf = useAction(() => get<{ url: string }>(`/admin/reports/${id}/pdf`), { onDone: (r) => window.open(r.url, '_blank', 'noopener') });
  const regen = useAction(() => post(`/admin/reports/${id}/regenerate-pdf`), { success: 'PDF regenerated', invalidate: [['report', id]] });
  if (q.isLoading) return <Skeleton className="h-80" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const r = q.data;
  const latest = Math.max(...r.versions.map((v) => v.version));
  const visitLike: Visit = {
    _id: '', status: 'COMPLETED', startedAt: r.data.visit.startedAt, completedAt: r.data.visit.completedAt, version: r.version,
    measurements: r.data.measurements, symptoms: r.data.symptoms, symptomNotes: r.data.symptomNotes, medicationStatus: r.data.medicationStatus, mobility: r.data.mobility,
    wellbeing: r.data.wellbeing, notes: r.data.notes, overallStatus: r.data.overallStatus, urgent: r.data.urgent, followUpRequired: r.data.followUp?.required, followUpNotes: r.data.followUp?.notes, media: r.media,
  };
  return (
    <>
      <PageHeader
        back={{ href: '/reports', label: 'Reports' }}
        title={`${r.data.patient.name}: ${r.serviceName}`}
        subtitle={<span className="flex flex-wrap items-center gap-3">{r.reportNumber} · version {r.version} · {dateTime(r.visitDate)}{r.version < latest && <Badge tone="warn">Superseded by v{latest}</Badge>}</span>}
        actions={
          <>
            <Button variant="secondary" onClick={() => regen.mutate(undefined)} loading={regen.isPending}><RefreshCw className="h-4 w-4" />Regenerate PDF</Button>
            <Button onClick={() => pdf.mutate(undefined)} loading={pdf.isPending}><Download className="h-4 w-4" />Open PDF</Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="As shared with the family">
          <VisitRecordReadOnly visit={visitLike} />
          <p className="mt-4 rounded-lg bg-canvas p-3 text-sm text-ink-muted">{r.data.disclaimer}</p>
        </Panel>
        <div className="space-y-6">
          <Panel title="Details">
            <KeyVal cols={1} items={[
              ['Parent', `${r.data.patient.name}, ${r.data.patient.age ?? '—'} yrs, ${humanize(r.data.patient.gender)}, ${r.data.patient.bloodGroup || ''}`],
              ['Booking', <Link key="b" href={`/bookings/${r.bookingId}`} className="link">{r.data.visit.bookingNumber}</Link>],
              ['Assistant', r.data.assistant?.name],
              ['Visit', `${dateTime(r.data.visit.startedAt)} to ${dateTime(r.data.visit.completedAt, { day: undefined, month: undefined, year: undefined })}`],
              ['PDF', `${humanize(r.pdf?.status)}${r.pdf?.error ? `: ${r.pdf.error}` : ''}`],
            ]} />
          </Panel>
          <Panel title="Versions" bodyClass="p-0">
            <ul>
              {r.versions.map((v) => (
                <li key={v._id} className="border-b border-line last:border-0">
                  <Link href={`/reports/${v._id}`} className={`flex justify-between px-5 py-3 hover:bg-canvas/70 ${v._id === r._id ? 'font-semibold' : ''}`}>
                    <span>v{v.version} · {v.reportNumber}</span><span className="text-sm text-ink-muted">{dateTime(v.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

// Report snapshots are immutable — corrections happen on the booking page.
function VisitRecordReadOnly({ visit }: { visit: Visit }) {
  return (
    <div className="[&_button]:hidden">
      <VisitRecord visit={visit} />
    </div>
  );
}
