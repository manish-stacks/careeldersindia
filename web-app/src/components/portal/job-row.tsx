import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { BookingBadge } from '@/components/ui/status';
import { dateTime } from '@/lib/utils';
import type { BookingStatus } from '@/lib/types';

export type Job = {
  _id: string; bookingNumber: string; status: BookingStatus; scheduledAt: string; durationMinutes: number;
  service?: { name: string };
  patient?: { name: string; age?: number; gender?: string; bloodGroup?: string; medicalConditions?: string[]; allergies?: string[]; medicines?: { name: string; dosage?: string }[]; specialInstructions?: string; mobile?: string; emergencyContacts?: { name: string; mobile: string; relation?: string }[] };
  address?: { line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string };
  customerNotes?: string;
};

export function JobRow({ j }: { j: Job }) {
  return (
    <Link href={`/assistant/jobs/${j._id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-canvas">
      <div className="min-w-0">
        <p className="truncate font-semibold">{j.patient?.name}{j.patient?.age ? `, ${j.patient.age}` : ''} · {j.service?.name}</p>
        <p className="mt-0.5 truncate text-sm text-ink-muted">{dateTime(j.scheduledAt)} · {j.address?.city} {j.address?.pincode}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3"><BookingBadge status={j.status} /><ChevronRight className="h-4 w-4 text-ink-faint" /></div>
    </Link>
  );
}
