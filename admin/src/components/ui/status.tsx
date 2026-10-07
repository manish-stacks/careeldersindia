import { cn, humanize } from '@/lib/utils';
import type { BookingStatus, OverallStatus } from '@/lib/types';

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info';
const toneCls: Record<Tone, string> = {
  neutral: 'bg-canvas text-ink-soft ring-line',
  brand: 'bg-brand-soft text-brand-dark ring-brand-line',
  ok: 'bg-ok-soft text-ok ring-ok/20',
  warn: 'bg-warn-soft text-warn ring-warn/20',
  danger: 'bg-danger-soft text-danger ring-danger/20',
  info: 'bg-info-soft text-info ring-info/20',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium ring-1 ring-inset', toneCls[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const BOOKING_TONE: Record<BookingStatus, Tone> = {
  DRAFT: 'neutral',
  PENDING_PAYMENT: 'neutral',
  PAYMENT_SUCCESS: 'info',
  PENDING_ADMIN_VERIFICATION: 'warn',
  VERIFIED: 'warn',
  ASSISTANT_ASSIGNED: 'info',
  ASSISTANT_ACCEPTED: 'info',
  ON_THE_WAY: 'brand',
  REACHED: 'brand',
  VISIT_STARTED: 'brand',
  VISIT_COMPLETED: 'ok',
  REPORT_GENERATED: 'ok',
  COMPLETED: 'ok',
  CANCELLED_BY_CUSTOMER: 'neutral',
  CANCELLED_BY_ADMIN: 'neutral',
  ASSISTANT_REJECTED: 'danger',
  NO_SHOW: 'danger',
  RESCHEDULED: 'warn',
};

const BOOKING_LABEL: Partial<Record<BookingStatus, string>> = {
  PENDING_ADMIN_VERIFICATION: 'Needs verification',
  VERIFIED: 'Verified · unassigned',
  ASSISTANT_ASSIGNED: 'Awaiting assistant',
  ASSISTANT_ACCEPTED: 'Assistant confirmed',
  ASSISTANT_REJECTED: 'Rejected · reassign',
  CANCELLED_BY_CUSTOMER: 'Cancelled by customer',
  CANCELLED_BY_ADMIN: 'Cancelled by admin',
};

export const bookingLabel = (s: BookingStatus) => BOOKING_LABEL[s] || humanize(s);

export function BookingBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge tone={BOOKING_TONE[status] || 'neutral'} dot>
      {bookingLabel(status)}
    </Badge>
  );
}

const OVERALL: Record<OverallStatus, { tone: Tone; label: string }> = {
  STABLE: { tone: 'ok', label: 'Stable' },
  NEEDS_ATTENTION: { tone: 'warn', label: 'Needs attention' },
  URGENT_ATTENTION: { tone: 'danger', label: 'Urgent attention' },
};
export function OverallBadge({ status }: { status?: OverallStatus | null }) {
  if (!status) return <span className="text-ink-faint">—</span>;
  return <Badge tone={OVERALL[status].tone}>{OVERALL[status].label}</Badge>;
}

export function VerificationBadge({ status }: { status: string }) {
  const tone: Tone = status === 'APPROVED' ? 'ok' : status === 'REJECTED' ? 'danger' : status === 'DOCUMENT_REVIEW' ? 'info' : 'warn';
  return <Badge tone={tone}>{humanize(status)}</Badge>;
}

export function PaymentBadge({ status }: { status: string }) {
  const tone: Tone = ['CAPTURED', 'PAID', 'PREPAID_PLAN'].includes(status) ? 'ok' : ['FAILED'].includes(status) ? 'danger' : ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(status) ? 'info' : 'neutral';
  return <Badge tone={tone}>{status === 'PREPAID_PLAN' ? 'Prepaid (plan)' : humanize(status)}</Badge>;
}
