'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, FileX2, ExternalLink, Phone, Mail, Pencil, Trash2, Upload } from 'lucide-react';
import { del, get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { age, dateOnly, dateTime, humanize, relative } from '@/lib/utils';
import { ErrorState, KeyVal, PageHeader, Panel, Skeleton } from '@/components/ui/misc';
import { Badge, BookingBadge, VerificationBadge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { LoginToggleButton, ResetPasswordButton } from '@/components/people/admin-dialogs';
import { EditAssistantDialog, PayoutDialog, UploadDocumentDialog, WhereWhenDialog } from '@/components/people/assistant-dialogs';
import { AssistantDayReport } from '@/components/people/day-report';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type Detail = {
  profile: {
    _id: string; verificationStatus: string; gender?: string; dateOfBirth?: string; qualification?: string; experienceYears: number; languages: string[];
    address?: { line1?: string; city?: string; state?: string; pincode?: string }; serviceAreas: { city: string; pincodes: string[] }[]; serviceIds: { _id: string; name: string }[];
    workingHours: { day: number; start: string; end: string }[]; isOnline: boolean; isAvailable: boolean; lastSeenAt?: string;
    bank?: { accountHolder?: string; accountLast4?: string; ifsc?: string; upiId?: string }; pan?: { last4?: string };
    rating: { avg: number; count: number }; stats: { completedVisits: number };
    verificationHistory: { from: string; to: string; by?: { name: string } | null; notes?: string; at: string }[];
    userId: { _id: string; name: string; email: string; mobile?: string; status: string; createdAt: string; lastLoginAt?: string };
  };
  documents: { _id: string; type: string; status: string; numberLast4?: string; reviewNotes?: string; createdAt: string; reviewedBy?: { name: string }; file: { url: string; mime: string } | null }[];
  recentJobs: { _id: string; bookingNumber: string; scheduledAt: string; status: never; parentSnapshot: { fullName: string }; addressSnapshot: { city: string }; serviceSnapshot: { name: string } }[];
  assignmentStats: Record<string, number>;
  lastLocation: { latitude: number; longitude: number; timestamp: string } | null;
};

const NEXT: Record<string, { to: string; label: string; variant: 'primary' | 'secondary' | 'danger' }[]> = {
  PENDING: [{ to: 'DOCUMENT_REVIEW', label: 'Start review', variant: 'secondary' }, { to: 'APPROVED', label: 'Approve', variant: 'primary' }, { to: 'REJECTED', label: 'Reject', variant: 'danger' }],
  DOCUMENT_REVIEW: [{ to: 'APPROVED', label: 'Approve', variant: 'primary' }, { to: 'REJECTED', label: 'Reject', variant: 'danger' }],
  APPROVED: [{ to: 'REJECTED', label: 'Revoke approval', variant: 'danger' }],
  REJECTED: [{ to: 'DOCUMENT_REVIEW', label: 'Re-open review', variant: 'secondary' }],
};

export default function AssistantPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['assistant', id], queryFn: () => get<Detail>(`/admin/assistants/${id}`) });
  const sp = useSearchParams();
  const [verify, setVerify] = useState<{ to: string; label: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dlg, setDlg] = useState<'where' | 'payout' | null>(null);
  const removeDoc = useAction((docId: string) => del(`/admin/assistant-documents/${docId}`), { success: 'Document removed', invalidate: [['assistant', id]] });
  const review = useAction(({ docId, status }: { docId: string; status: string }) => post(`/admin/assistant-documents/${docId}/review`, { status }), { success: 'Document reviewed', invalidate: [['assistant', id]] });

  if (q.isLoading) return <Skeleton className="h-80" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { profile: p, documents, recentJobs, assignmentStats } = q.data;
  const u = p.userId;
  const hasGovId = documents.some((d) => d.type === 'GOV_ID' && d.status !== 'REJECTED');
  const accepted = assignmentStats.ACCEPTED || 0;
  const rejected = assignmentStats.REJECTED || 0;

  return (
    <>
      <PageHeader
        back={{ href: '/assistants', label: 'Assistants' }}
        title={u.name}
        subtitle={<span className="flex flex-wrap items-center gap-3"><VerificationBadge status={p.verificationStatus} />{u.status !== 'ACTIVE' && <Badge tone="danger">Login off</Badge>}<span>{p.isOnline ? 'Online now' : p.lastSeenAt ? `Last seen ${relative(p.lastSeenAt)}` : 'Offline'}</span></span>}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit details</Button>
            {(NEXT[p.verificationStatus] || []).map((a) => (
              <Button key={a.to} variant={a.variant} onClick={() => setVerify(a)} disabled={a.to === 'APPROVED' && !hasGovId} title={a.to === 'APPROVED' && !hasGovId ? 'Needs a government ID document first' : undefined}>
                {a.label}
              </Button>
            ))}
            <ResetPasswordButton userId={u._id} /><LoginToggleButton userId={u._id} enabled={u.status === 'ACTIVE'} invalidate={[['assistant', id], ['assistants']]} />
          </>
        }
      />
      {!hasGovId && p.verificationStatus !== 'APPROVED' && (
        <p className="mb-6 rounded-panel border border-warn/30 bg-warn-soft px-5 py-3 text-warn">No government ID uploaded yet. Approval is blocked until one is on file.</p>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title="Documents" bodyClass="p-0" action={<Button size="sm" variant="secondary" onClick={() => setUploading(true)}><Upload className="h-4 w-4" />Upload</Button>}>
            <ul>
              {documents.map((d) => (
                <li key={d._id} className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-3 last:border-0">
                  {d.file?.mime.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a href={d.file.url} target="_blank" rel="noreferrer"><img src={d.file.url} alt={humanize(d.type)} className="h-14 w-20 rounded-md border border-line object-cover" /></a>
                  ) : (
                    <a href={d.file?.url} target="_blank" rel="noreferrer" className="flex h-14 w-20 items-center justify-center rounded-md border border-line bg-canvas"><ExternalLink className="h-4 w-4 text-ink-faint" /></a>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{d.type === 'GOV_ID' ? 'Government ID' : humanize(d.type)} {d.numberLast4 && <span className="font-normal text-ink-muted">ending {d.numberLast4}</span>}</p>
                    <p className="text-sm text-ink-muted">Uploaded {dateOnly(d.createdAt)}{d.reviewedBy ? ` · reviewed by ${d.reviewedBy.name}` : ''}</p>
                  </div>
                  <Badge tone={d.status === 'ACCEPTED' ? 'ok' : d.status === 'REJECTED' ? 'danger' : 'warn'}>{humanize(d.status)}</Badge>
                  <Button size="sm" variant="ghost" aria-label="Delete document" onClick={() => { if (window.confirm('Delete this document?')) removeDoc.mutate(d._id); }}><Trash2 className="h-4 w-4" /></Button>
                  {d.status === 'PENDING' && (
                    <span className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => review.mutate({ docId: d._id, status: 'ACCEPTED' })}><FileCheck2 className="h-4 w-4" />Accept</Button>
                      <Button size="sm" variant="danger" onClick={() => review.mutate({ docId: d._id, status: 'REJECTED' })}><FileX2 className="h-4 w-4" />Reject</Button>
                    </span>
                  )}
                </li>
              ))}
              {!documents.length && <li className="px-5 py-6 text-ink-muted">No documents uploaded.</li>}
            </ul>
          </Panel>

          <AssistantDayReport assistantId={u._id} initialFrom={sp.get('from') || undefined} initialTo={sp.get('to') || undefined} />

          <Panel title="Recent visits" bodyClass="p-0" action={<Link href={`/bookings?assistantId=${u._id}`} className="link text-sm">All</Link>}>
            <ul>
              {recentJobs.map((j) => (
                <li key={j._id} className="border-b border-line last:border-0">
                  <Link href={`/bookings/${j._id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas/70">
                    <span>{j.parentSnapshot.fullName} <span className="text-ink-muted">· {j.addressSnapshot.city}</span><span className="block text-sm text-ink-muted">{j.serviceSnapshot.name} · {dateTime(j.scheduledAt)}</span></span>
                    <BookingBadge status={j.status} />
                  </Link>
                </li>
              ))}
              {!recentJobs.length && <li className="px-5 py-6 text-ink-muted">No visits yet.</li>}
            </ul>
          </Panel>

          <Panel title="Verification history">
            <ol className="space-y-2 text-[15px]">
              {[...p.verificationHistory].reverse().map((h, i) => (
                <li key={i}><span className="font-medium">{humanize(h.to)}</span> <span className="text-ink-muted">· {dateTime(h.at)} · {h.by?.name || 'system'}</span>{h.notes && <span className="block text-sm text-ink-soft">“{h.notes}”</span>}</li>
              ))}
              {!p.verificationHistory.length && <li className="text-ink-muted">Not reviewed yet.</li>}
            </ol>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Profile">
            <div className="mb-4 space-y-1">
              <a href={`mailto:${u.email}`} className="flex items-center gap-2 hover:underline"><Mail className="h-4 w-4 text-brand" />{u.email}</a>
              {u.mobile && <a href={`tel:${u.mobile}`} className="flex items-center gap-2 hover:underline"><Phone className="h-4 w-4 text-brand" />{u.mobile}</a>}
            </div>
            <KeyVal items={[
              ['Age', p.dateOfBirth ? `${age(p.dateOfBirth)} yrs` : '—'], ['Gender', humanize(p.gender)], ['Qualification', p.qualification], ['Experience', `${p.experienceYears} years`],
              ['Languages', p.languages.join(', ')], ['Lives in', [p.address?.city, p.address?.pincode].filter(Boolean).join(' ')],
              ['Completed visits', p.stats?.completedVisits ?? 0], ['Accepted / rejected jobs', `${accepted} / ${rejected}`],
            ]} />
          </Panel>
          <Panel title="Where and when" action={<Button size="sm" variant="secondary" onClick={() => setDlg('where')}><Pencil className="h-4 w-4" />Edit</Button>}>
            <p className="text-sm text-ink-muted">Service areas</p>
            <ul className="mb-4 mt-1 space-y-1">{p.serviceAreas.map((s) => <li key={s.city}>{s.city}{s.pincodes.length ? <span className="text-sm text-ink-muted"> · {s.pincodes.join(', ')}</span> : <span className="text-sm text-ink-muted"> · whole city</span>}</li>)}</ul>
            <p className="text-sm text-ink-muted">Services</p>
            <p className="mb-4 mt-1">{p.serviceIds.length ? p.serviceIds.map((s) => s.name).join(', ') : 'All services'}</p>
            <p className="text-sm text-ink-muted">Working hours (IST)</p>
            <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs">
              {DAYS.map((d, i) => {
                const w = p.workingHours.find((x) => x.day === i);
                return <div key={d} className={w ? 'rounded-md bg-ok-soft px-1 py-2 text-ok' : 'rounded-md bg-canvas px-1 py-2 text-ink-faint'}><p className="font-semibold">{d}</p><p>{w ? `${w.start}` : 'off'}</p><p>{w ? w.end : ''}</p></div>;
              })}
            </div>
            {!p.isAvailable && <p className="mt-3 text-sm text-warn">Marked themselves unavailable.</p>}
          </Panel>
          <Panel title="Payout details" action={<Button size="sm" variant="secondary" onClick={() => setDlg('payout')}><Pencil className="h-4 w-4" />Edit</Button>}>
            <KeyVal items={[['Account holder', p.bank?.accountHolder], ['Account', p.bank?.accountLast4 ? `•••• ${p.bank.accountLast4}` : '—'], ['IFSC', p.bank?.ifsc], ['UPI', p.bank?.upiId], ['PAN', p.pan?.last4 ? `•••••••${p.pan.last4}` : '—']]} />
            <p className="mt-3 text-xs text-ink-faint">Full numbers are encrypted and never shown here.</p>
          </Panel>
        </div>
      </div>
      {dlg === 'where' && <WhereWhenDialog profile={p} onClose={() => setDlg(null)} />}
      {dlg === 'payout' && <PayoutDialog profile={p} onClose={() => setDlg(null)} />}
      {editing && <EditAssistantDialog profile={p} onClose={() => setEditing(false)} />}
      {uploading && <UploadDocumentDialog assistantId={u._id} onClose={() => setUploading(false)} />}
      {verify && <VerifyDialog id={u._id} name={u.name} action={verify} onClose={() => setVerify(null)} />}
    </>
  );
}

function VerifyDialog({ id, name, action, onClose }: { id: string; name: string; action: { to: string; label: string }; onClose: () => void }) {
  const [notes, setNotes] = useState('');
  const rejecting = action.to === 'REJECTED';
  const act = useAction(() => post(`/admin/assistants/${id}/verification`, { status: action.to, notes: notes || undefined }), { success: `${name}: ${humanize(action.to)}`, invalidate: [['assistant', id], ['assistants'], ['dashboard']], onDone: onClose });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${action.label}: ${name}`}
      description={action.to === 'APPROVED' ? 'They can receive visits right away. Pending documents are marked accepted.' : rejecting ? 'They will be told the reason and cannot be assigned visits.' : undefined}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={rejecting ? 'danger' : 'primary'} onClick={() => act.mutate(undefined)} loading={act.isPending} disabled={rejecting && notes.trim().length < 3}>{action.label}</Button></>}
    >
      <Field label={rejecting ? 'Reason (shared with the assistant)' : 'Notes (optional)'}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Dialog>
  );
}
