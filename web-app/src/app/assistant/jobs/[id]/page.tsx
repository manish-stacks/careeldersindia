'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { PageHeader, Panel, KeyVal, ErrorState, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { BookingBadge } from '@/components/ui/status';
import { VisitForm } from '@/components/portal/visit-form';
import { PdfButton } from '@/components/portal/pdf-button';
import { dateTime } from '@/lib/utils';
import type { Job } from '@/components/portal/job-row';

const DONE = ['VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED'];

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState('');
  const [missed, setMissed] = useState(false);
  const q = useQuery({ queryKey: ['assistant', 'job', id], queryFn: () => get<Job & { reportId?: string }>(`/assistant/jobs/${id}`), refetchInterval: (query) => (query.state.data?.status === 'VISIT_STARTED' ? false : 30_000) });
  const keys = [['assistant', 'job', id], ['assistant', 'jobs'], ['assistant', 'home']];
  const step = (path: string, message: string, body?: unknown) => ({ fn: () => post(`/assistant/jobs/${id}/${path}`, body), message });
  const accept = useAction(step('accept', 'Job accepted').fn, { success: 'Job accepted', invalidate: keys });
  const travel = useAction(step('start-travel', '').fn, { success: 'Marked as on the way', invalidate: keys });
  const reached = useAction(step('reached', '', {}).fn, { success: 'Marked as reached', invalidate: keys });
  const start = useAction(step('start-visit', '').fn, { success: 'Visit started', invalidate: keys });
  const rej = useAction(() => post(`/assistant/jobs/${id}/reject`, { reason: reason.trim() }), { success: 'Job declined', invalidate: keys, onDone: () => setReject(false) });

  const noShow = useAction(() => post(`/assistant/jobs/${id}/no-show`, { reason: reason.trim() }), { success: 'Reported to the care team', invalidate: keys, onDone: () => setMissed(false) });

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const j = q.data;
  const p = j.patient;
  const a = j.address;
  const actions: Record<string, React.ReactNode> = {
    ASSISTANT_ASSIGNED: <><Button onClick={() => accept.mutate(undefined)} loading={accept.isPending}>Accept job</Button><Button variant="danger" onClick={() => setReject(true)}>Decline</Button></>,
    ASSISTANT_ACCEPTED: <Button onClick={() => travel.mutate(undefined)} loading={travel.isPending}>I am on the way</Button>,
    ON_THE_WAY: <Button onClick={() => reached.mutate(undefined)} loading={reached.isPending}>I have reached</Button>,
    REACHED: <><Button onClick={() => start.mutate(undefined)} loading={start.isPending}>Start visit</Button><Button variant="danger" onClick={() => { setReason(''); setMissed(true); }}>Nobody at home</Button></>,
    VISIT_COMPLETED: j.reportId ? <PdfButton reportId={j.reportId} /> : null,
    REPORT_GENERATED: j.reportId ? <PdfButton reportId={j.reportId} /> : null,
    COMPLETED: j.reportId ? <PdfButton reportId={j.reportId} /> : null,
  };
  return (
    <div className="space-y-5">
      <PageHeader back={{ href: '/assistant/jobs', label: 'My jobs' }} title={`${j.service?.name} · ${j.bookingNumber}`} subtitle={<BookingBadge status={j.status} />} actions={<div className="flex flex-wrap gap-2">{actions[j.status]}</div>} />
      {DONE.includes(j.status) && <p className="rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok">Visit completed. Thank you. The report has been sent to the family.</p>}
      {j.status === 'VISIT_STARTED' && <VisitForm jobId={id} onDone={() => q.refetch()} />}
      <Panel title="Visit">
        <KeyVal items={[
          ['When', dateTime(j.scheduledAt)],
          ['Duration', `${j.durationMinutes} minutes`],
          ['Address', a ? [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(', ') : '—'],
          ['Customer notes', j.customerNotes || '—'],
        ]} />
      </Panel>
      <Panel title="Patient">
        <KeyVal items={[
          ['Name', `${p?.name}${p?.age ? `, ${p.age} years` : ''}`],
          ['Blood group', p?.bloodGroup || '—'],
          ['Medical conditions', p?.medicalConditions?.join(', ') || '—'],
          ['Allergies', p?.allergies?.join(', ') || '—'],
          ['Medicines', p?.medicines?.map((m) => `${m.name}${m.dosage ? ` (${m.dosage})` : ''}`).join(', ') || '—'],
          ['Special instructions', p?.specialInstructions || '—'],
          ...(p?.mobile ? ([['Patient mobile', p.mobile]] as [string, string][]) : []),
          ...(p?.emergencyContacts?.length ? ([['Emergency contact', p.emergencyContacts.map((c) => `${c.name} ${c.mobile}`).join(', ')]] as [string, string][]) : []),
        ]} />
      </Panel>
      <Dialog open={missed} onClose={() => setMissed(false)} title="Report a missed visit" description="Please call the family and the care desk first."
        footer={<><Button variant="secondary" onClick={() => setMissed(false)}>Back</Button><Button variant="danger" onClick={() => noShow.mutate(undefined)} loading={noShow.isPending} disabled={reason.trim().length < 3}>Report</Button></>}>
        <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No one answered the door" /></Field>
      </Dialog>
      <Dialog open={reject} onClose={() => setReject(false)} title="Decline this job?" description="Tell the care desk why so they can reassign it."
        footer={<><Button variant="secondary" onClick={() => setReject(false)}>Back</Button><Button variant="danger" onClick={() => rej.mutate(undefined)} loading={rej.isPending} disabled={reason.trim().length < 3}>Decline job</Button></>}>
        <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Dialog>
    </div>
  );
}
