import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingStatus, OverallStatus } from '@/lib/types';
import { C, S, type Tone } from '@/lib/theme';
import { Badge, T } from './ui';

export const BOOKING: Record<BookingStatus, { label: string; tone: Tone; family: string }> = {
  DRAFT: { label: 'Draft', tone: 'neutral', family: 'Not booked yet' },
  PENDING_PAYMENT: { label: 'Payment pending', tone: 'warn', family: 'Complete payment to confirm this visit' },
  PAYMENT_SUCCESS: { label: 'Paid', tone: 'info', family: 'Payment received' },
  PENDING_ADMIN_VERIFICATION: { label: 'Being checked', tone: 'info', family: 'Our care team is checking the details' },
  VERIFIED: { label: 'Confirmed', tone: 'info', family: 'Confirmed. We are choosing the best care assistant' },
  ASSISTANT_ASSIGNED: { label: 'Assistant chosen', tone: 'info', family: 'A care assistant has been chosen' },
  ASSISTANT_REJECTED: { label: 'Finding assistant', tone: 'info', family: 'We are arranging another care assistant' },
  ASSISTANT_ACCEPTED: { label: 'Assistant confirmed', tone: 'ok', family: 'Your care assistant has confirmed the visit' },
  ON_THE_WAY: { label: 'On the way', tone: 'brand', family: 'Your care assistant is on the way' },
  REACHED: { label: 'Arrived', tone: 'brand', family: 'Your care assistant has arrived' },
  VISIT_STARTED: { label: 'Visit in progress', tone: 'brand', family: 'The visit is in progress' },
  VISIT_COMPLETED: { label: 'Visit done', tone: 'ok', family: 'Visit complete. Preparing the report' },
  REPORT_GENERATED: { label: 'Report ready', tone: 'ok', family: 'The report is ready' },
  COMPLETED: { label: 'Completed', tone: 'ok', family: 'Visit complete. Report ready' },
  CANCELLED_BY_CUSTOMER: { label: 'Cancelled', tone: 'neutral', family: 'You cancelled this visit' },
  CANCELLED_BY_ADMIN: { label: 'Cancelled', tone: 'neutral', family: 'This visit was cancelled by our care team' },
  NO_SHOW: { label: 'Missed', tone: 'danger', family: 'The visit could not take place' },
  RESCHEDULED: { label: 'Rescheduled', tone: 'warn', family: 'This visit was moved' },
};

// Assistant-facing wording for the same states
export const JOB: Partial<Record<BookingStatus, { label: string; tone: Tone }>> = {
  ASSISTANT_ASSIGNED: { label: 'New: accept?', tone: 'warn' },
  ASSISTANT_ACCEPTED: { label: 'Accepted', tone: 'info' },
  ON_THE_WAY: { label: 'Travelling', tone: 'brand' },
  REACHED: { label: 'Arrived', tone: 'brand' },
  VISIT_STARTED: { label: 'In visit', tone: 'brand' },
  VISIT_COMPLETED: { label: 'Done', tone: 'ok' },
  REPORT_GENERATED: { label: 'Done', tone: 'ok' },
  COMPLETED: { label: 'Done', tone: 'ok' },
  NO_SHOW: { label: 'No-show', tone: 'danger' },
  CANCELLED_BY_ADMIN: { label: 'Cancelled', tone: 'neutral' },
  CANCELLED_BY_CUSTOMER: { label: 'Cancelled', tone: 'neutral' },
};

export const StatusBadge = ({ status }: { status: BookingStatus }) => <Badge label={BOOKING[status]?.label || status} tone={BOOKING[status]?.tone} />;
export const JobBadge = ({ status }: { status: BookingStatus }) => <Badge label={JOB[status]?.label || BOOKING[status]?.label || status} tone={JOB[status]?.tone || 'neutral'} />;

export const OVERALL: Record<OverallStatus, { label: string; tone: Tone; icon: 'checkmark-circle' | 'eye' | 'alert-circle' }> = {
  STABLE: { label: 'Stable', tone: 'ok', icon: 'checkmark-circle' },
  NEEDS_ATTENTION: { label: 'Needs attention', tone: 'warn', icon: 'eye' },
  URGENT_ATTENTION: { label: 'Urgent attention', tone: 'danger', icon: 'alert-circle' },
};
export const OverallBadge = ({ status }: { status?: OverallStatus | null }) => (status ? <Badge label={OVERALL[status].label} tone={OVERALL[status].tone} icon={OVERALL[status].icon} /> : null);

const STEPS: { key: string; label: string; reached: BookingStatus[] }[] = [
  { key: 'booked', label: 'Booked & paid', reached: ['PENDING_ADMIN_VERIFICATION', 'VERIFIED', 'ASSISTANT_ASSIGNED', 'ASSISTANT_REJECTED', 'ASSISTANT_ACCEPTED', 'ON_THE_WAY', 'REACHED', 'VISIT_STARTED', 'VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED'] },
  { key: 'confirmed', label: 'Checked by care team', reached: ['VERIFIED', 'ASSISTANT_ASSIGNED', 'ASSISTANT_REJECTED', 'ASSISTANT_ACCEPTED', 'ON_THE_WAY', 'REACHED', 'VISIT_STARTED', 'VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED'] },
  { key: 'assistant', label: 'Care assistant confirmed', reached: ['ASSISTANT_ACCEPTED', 'ON_THE_WAY', 'REACHED', 'VISIT_STARTED', 'VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED'] },
  { key: 'way', label: 'On the way', reached: ['ON_THE_WAY', 'REACHED', 'VISIT_STARTED', 'VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED'] },
  { key: 'visit', label: 'Visit', reached: ['VISIT_STARTED', 'VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED'] },
  { key: 'report', label: 'Report ready', reached: ['REPORT_GENERATED', 'COMPLETED'] },
];

/** The family's view of progress: six plain steps instead of eighteen states. */
export function Progress({ status }: { status: BookingStatus }) {
  const idx = STEPS.reduce((acc, s, i) => (s.reached.includes(status) ? i : acc), -1);
  return (
    <View>
      {STEPS.map((s, i) => {
        const done = i <= idx;
        const current = i === idx + 1 && idx >= 0;
        return (
          <View key={s.key} style={{ flexDirection: 'row', gap: S.md, minHeight: 40 }}>
            <View style={{ alignItems: 'center', width: 24 }}>
              <View
                style={{
                  width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: done ? C.brand : C.card, borderWidth: 2, borderColor: done ? C.brand : current ? C.brand : C.lineStrong,
                }}
              >
                {done && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              {i < STEPS.length - 1 && <View style={{ flex: 1, width: 2, backgroundColor: i < idx ? C.brand : C.line, marginVertical: 2 }} />}
            </View>
            <T v="body" weight={done || current ? 'semibold' : 'regular'} color={done || current ? C.ink : C.faint} style={{ paddingTop: 1, paddingBottom: 12 }}>
              {s.label}
            </T>
          </View>
        );
      })}
    </View>
  );
}
