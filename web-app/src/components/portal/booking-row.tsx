import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { BookingBadge } from '@/components/ui/status';
import { dateTime, inr } from '@/lib/utils';
import type { Booking } from '@/lib/types';

export type CustomerBooking = Omit<Booking, 'assistantId'> & { assistant?: { name: string; mobile?: string } | null; reportId?: string };

export function BookingRow({ b }: { b: CustomerBooking }) {
  return (
    <Link href={`/customer/bookings/${b._id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-canvas">
      <div className="min-w-0">
        <p className="truncate font-semibold">{b.serviceSnapshot?.name || 'Home visit'} · {b.parentSnapshot?.fullName}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{dateTime(b.scheduledAt)} · {b.bookingNumber}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-sm text-ink-soft sm:block">{inr(b.price?.amount)}</span>
        <BookingBadge status={b.status} />
        <ChevronRight className="h-4 w-4 text-ink-faint" />
      </div>
    </Link>
  );
}
