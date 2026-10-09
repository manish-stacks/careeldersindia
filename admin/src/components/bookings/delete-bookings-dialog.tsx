'use client';
import { post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

/** Permanently deletes one or many bookings (with their visit records, reports, photos and payments). */
export function DeleteBookingsDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone?: () => void }) {
  const act = useAction(() => post<{ deleted: number; skipped: number }>('/admin/bookings/delete-many', { ids }), {
    success: 'Deleted',
    invalidate: [['bookings'], ['booking'], ['customer'], ['today']],
    onDone: () => { onDone?.(); onClose(); },
  });
  const n = ids.length;
  return (
    <Dialog open onClose={onClose} title={n === 1 ? 'Delete this booking?' : `Delete ${n} bookings?`}
      description="This permanently deletes the booking(s) and everything linked to them: visit record, test values, reports, photos and payment. Visits already in progress are skipped."
      footer={<><Button variant="secondary" onClick={onClose}>Keep</Button><Button variant="danger" onClick={() => act.mutate(undefined)} loading={act.isPending}>{n === 1 ? 'Delete booking' : `Delete ${n} bookings`}</Button></>}>
      <p className="text-sm font-semibold text-danger">This cannot be undone.</p>
    </Dialog>
  );
}
