'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star, Wifi, AlertCircle, Ban } from 'lucide-react';
import { get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { Eligible } from '@/lib/types';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/misc';

export const REASON_TEXT: Record<string, string> = {
  NOT_VERIFIED: 'Not verified',
  ACCOUNT_INACTIVE: 'Account suspended',
  MARKED_UNAVAILABLE: 'Marked unavailable',
  OUTSIDE_SERVICE_AREA: 'Outside service area',
  SERVICE_NOT_SUPPORTED: "Doesn't offer this service",
  OUTSIDE_WORKING_HOURS: 'Outside working hours',
  SLOT_CONFLICT: 'Has another visit then',
};
const HARD = ['NOT_VERIFIED', 'ACCOUNT_INACTIVE'];

export function AssignDialog({ bookingId, open, onClose, current }: { bookingId: string; open: boolean; onClose: () => void; current?: string }) {
  const [picked, setPicked] = useState<Eligible | null>(null);
  const [reason, setReason] = useState('');
  const list = useQuery({ queryKey: ['eligible', bookingId], queryFn: () => get<Eligible[]>(`/admin/bookings/${bookingId}/eligible-assistants`), enabled: open });
  const assign = useAction(
    () => post(`/admin/bookings/${bookingId}/assign`, { assistantId: picked!.assistantId, override: !picked!.eligible, overrideReason: picked!.eligible ? undefined : reason.trim() }),
    {
      success: `${picked?.name ?? 'Assistant'} assigned — they have been notified`,
      invalidate: [['booking', bookingId], ['bookings'], ['dashboard']],
      onDone: () => {
        setPicked(null);
        setReason('');
        onClose();
      },
    }
  );
  const needsReason = picked && !picked.eligible;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={current ? 'Reassign assistant' : 'Assign an assistant'}
      description="Best matches first: eligible, fewest visits that day, then nearest. Unverified assistants can never be assigned."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => assign.mutate(undefined)} loading={assign.isPending} disabled={!picked || (needsReason ? reason.trim().length < 5 : false)}>
            {needsReason ? 'Assign with override' : 'Assign'}
          </Button>
        </>
      }
    >
      {list.isLoading && <Skeleton className="h-40" />}
      {list.data && list.data.length === 0 && <p className="text-ink-muted">No approved assistants yet.</p>}
      <ul className="space-y-2" role="radiogroup" aria-label="Assistants">
        {list.data?.map((a) => {
          const hard = a.reasons.some((r) => HARD.includes(r));
          const selected = picked?.assistantId === a.assistantId;
          return (
            <li key={a.assistantId}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={hard || a.isCurrent}
                onClick={() => setPicked(a)}
                className={cn(
                  'flex w-full items-start gap-4 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  selected ? 'border-brand bg-brand-soft/60 ring-1 ring-brand' : 'border-line hover:border-ink-faint'
                )}
              >
                <span className={cn('mt-1 h-4 w-4 shrink-0 rounded-full border-2', selected ? 'border-brand bg-brand shadow-[inset_0_0_0_2px_#fff]' : 'border-line-strong')} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{a.name}</span>
                    {a.isCurrent && <span className="text-sm text-ink-muted">Currently assigned</span>}
                    {a.isOnline && (
                      <span className="inline-flex items-center gap-1 text-sm text-ok">
                        <Wifi className="h-3.5 w-3.5" /> Online
                      </span>
                    )}
                    {!!a.rating?.count && (
                      <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
                        <Star className="h-3.5 w-3.5 fill-current text-warn" /> {a.rating.avg.toFixed(1)} ({a.rating.count})
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-muted">
                    {a.jobsThatDay} visit{a.jobsThatDay === 1 ? '' : 's'} that day
                    {a.distanceMeters !== null && ` · ${(a.distanceMeters / 1000).toFixed(1)} km away now`}
                    {!!a.experienceYears && ` · ${a.experienceYears} yrs`}
                    {!!a.languages?.length && ` · ${a.languages.join(', ')}`}
                  </span>
                  {a.reasons.length > 0 && (
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {a.reasons.map((r) => (
                        <span key={r} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px]', HARD.includes(r) ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')}>
                          {HARD.includes(r) ? <Ban className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                          {REASON_TEXT[r] || r}
                          {r === 'SLOT_CONFLICT' && a.clashWith ? ` (${a.clashWith})` : ''}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {needsReason && (
        <Field label="Why override?" hint="Saved on the booking and in the audit log." className="mt-4">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Neha confirmed on call she can cover this Sunday visit" />
        </Field>
      )}
    </Dialog>
  );
}
