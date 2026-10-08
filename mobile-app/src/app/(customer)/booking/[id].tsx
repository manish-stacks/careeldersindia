import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAction, confirm } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { useBookingRoom, useSocketEvent, EV } from '@/lib/socket';
import { addDays, hhmmLabel, inr, istDate, istToDate, relative, visitTime, ymdLabel } from '@/lib/format';
import { S } from '@/lib/theme';
import type { Booking, LiveLocation, Visit } from '@/lib/types';
import { Button, Card, Chip, ErrorView, Field, Input, KV, Loading, Notice, Screen, Section, Sheet, T } from '@/components/ui';
import { BOOKING, Progress, StatusBadge } from '@/components/status';
import { TrackMap } from '@/components/track-map';
import { VisitSummary } from '@/components/visit-summary';
import { DateInput } from '@/components/inputs';

const CANCELLABLE = ['PENDING_PAYMENT', 'PAYMENT_SUCCESS', 'PENDING_ADMIN_VERIFICATION', 'VERIFIED', 'ASSISTANT_ASSIGNED', 'ASSISTANT_REJECTED', 'ASSISTANT_ACCEPTED'];
const RESCHEDULABLE = ['PENDING_ADMIN_VERIFICATION', 'VERIFIED', 'ASSISTANT_ASSIGNED', 'ASSISTANT_REJECTED', 'ASSISTANT_ACCEPTED'];
const TRACKING = ['ON_THE_WAY', 'REACHED'];
const DONE = ['VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED'];
const SLOTS = Array.from({ length: 27 }, (_, i) => {
  const m = 420 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

export default function BookingDetail() {
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [live, setLive] = useState<LiveLocation | null>(null);
  const [sheet, setSheet] = useState<null | 'cancel' | 'reschedule'>(null);

  const q = useQuery({ queryKey: ['booking', id], queryFn: () => api.get<Booking>(`/customer/bookings/${id}`) });
  const b = q.data;
  const tracking = !!b && TRACKING.includes(b.status);
  const loc = useQuery({
    queryKey: ['booking', id, 'location'],
    queryFn: () => api.get<{ status: string; location: LiveLocation | null }>(`/customer/bookings/${id}/location`),
    enabled: tracking,
    refetchInterval: 30_000,
  });
  const visit = useQuery({ queryKey: ['booking', id, 'visit'], queryFn: () => api.get<Visit>(`/customer/bookings/${id}/visit`), enabled: !!b && DONE.includes(b.status) });

  useBookingRoom(id);
  useSocketEvent<{ location: LiveLocation }>(EV.LOCATION, (p) => p.location?.bookingId === id && setLive(p.location));
  useSocketEvent<{ bookingId: string }>(EV.HEALTH, (p) => p.bookingId === id && qc.invalidateQueries({ queryKey: ['booking', id] }));
  useEffect(() => setLive(null), [b?.status]);

  if (q.isLoading) return <Loading />;
  if (q.isError || !b) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;

  const t = visitTime(b.scheduledAt);
  const position = live || loc.data?.location;
  const hoursAhead = (new Date(b.scheduledAt).getTime() - Date.now()) / 3600000;
  const paid = ['PAID', 'PREPAID_PLAN'].includes(b.paymentStatus);
  const cancelled = b.status.startsWith('CANCELLED');

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Stack.Screen options={{ title: b.bookingNumber }} />
      <StatusBadge status={b.status} />
      <T v="title" style={{ marginTop: S.sm }}>{b.parentSnapshot.fullName}</T>
      <T>{b.serviceSnapshot.name}</T>
      <T v="small" style={{ marginTop: S.xs }}>{t.main}</T>
      {t.local ? <T v="caption">{t.local}</T> : null}

      <Card tone={BOOKING[b.status]?.tone} style={{ marginTop: S.lg }}>
        <T weight="semibold">{BOOKING[b.status]?.family}</T>
        {b.assistant?.name && !cancelled ? <T v="small">Care assistant: {b.assistant.name}</T> : null}
        {b.status === 'VISIT_STARTED' ? <T v="small">You&apos;ll see the full summary here as soon as the visit is complete.</T> : null}
      </Card>

      {b.status === 'PENDING_PAYMENT' && (
        <Button title={`Pay ${inr(b.price.amount)} to confirm`} onPress={() => router.push({ pathname: '/pay', params: { bookingId: b._id } })} style={{ marginTop: S.lg }} />
      )}

      {tracking && (
        <Section title="Live location" action={<T v="small">{position ? `Updated ${relative(position.timestamp)}` : 'Waiting for GPS'}</T>}>
          <TrackMap assistant={position ? { latitude: position.latitude, longitude: position.longitude } : null} home={b.locationSnapshot ? { latitude: b.locationSnapshot.lat, longitude: b.locationSnapshot.lng } : null} />
          <T v="caption" style={{ marginTop: S.xs }}>Location is shared only while the care assistant travels to this visit.</T>
        </Section>
      )}

      {DONE.includes(b.status) && (
        <Section title="Visit summary">
          <Card>
            {visit.isLoading ? <Loading /> : visit.data ? <VisitSummary data={{ ...visit.data, assistantName: b.assistant?.name }} /> : <T v="small">The summary is being prepared.</T>}
          </Card>
          {b.reportId && <Button title="Open full report" icon="document-text-outline" variant="secondary" onPress={() => router.push(`/report/${b.reportId}`)} style={{ marginTop: S.md }} />}
        </Section>
      )}

      {!cancelled && b.status !== 'NO_SHOW' && b.status !== 'PENDING_PAYMENT' && (
        <Section title="Progress">
          <Card>
            <Progress status={b.status} />
          </Card>
        </Section>
      )}

      {b.assistant?.name && !cancelled && (
        <Section title="Care assistant">
          <Card>
            <KV label="Name" value={b.assistant.name} />
            {b.assistant.mobile ? <KV label="Mobile" value={b.assistant.mobile} /> : null}
            {b.assistant.mobile ? <Button title="Call care assistant" icon="call-outline" variant="secondary" size="md" onPress={() => Linking.openURL(`tel:${b.assistant!.mobile}`)} style={{ marginTop: S.sm }} /> : null}
          </Card>
        </Section>
      )}

      <Section title="Patient">
        <Card>
          <KV label="Name" value={b.parentSnapshot.fullName} />
          {b.parentSnapshot.mobile ? <KV label="Mobile" value={b.parentSnapshot.mobile} /> : null}
          {auth.user?.email ? <KV label="Email" value={auth.user.email} /> : null}
          <KV label="Address" value={[b.addressSnapshot.line1, b.addressSnapshot.line2, b.addressSnapshot.city, b.addressSnapshot.pincode].filter(Boolean).join(', ')} />
        </Card>
      </Section>

      <Section title="Details">
        <Card>
          <KV label="Address" value={`${b.addressSnapshot.line1}, ${b.addressSnapshot.city}`} />
          <KV label="Duration" value={`About ${b.durationMinutes} min`} />
          <KV label="Amount" value={inr(b.price.amount)} />
          <KV label="Payment" value={b.paymentStatus === 'PREPAID_PLAN' ? 'Prepaid (plan)' : b.paymentStatus.replace(/_/g, ' ').toLowerCase()} />
          {b.customerNotes ? <KV label="Your note" value={b.customerNotes} /> : null}
          {b.cancellation?.reason ? <KV label="Cancelled because" value={b.cancellation.reason} /> : null}
        </Card>
      </Section>

      {(CANCELLABLE.includes(b.status) || RESCHEDULABLE.includes(b.status)) && (
        <View style={{ gap: S.sm, marginTop: S.xl }}>
          {RESCHEDULABLE.includes(b.status) && <Button title="Change date or time" variant="secondary" icon="calendar-outline" onPress={() => setSheet('reschedule')} />}
          {CANCELLABLE.includes(b.status) && <Button title="Cancel visit" variant="danger" onPress={() => setSheet('cancel')} />}
          {paid && CANCELLABLE.includes(b.status) && (
            <T v="caption">{hoursAhead >= 12 ? 'Cancelling now gets a full refund.' : 'Less than 12 hours to go: refunds for late cancellations are reviewed by our care team.'}</T>
          )}
        </View>
      )}

      <CancelSheet open={sheet === 'cancel'} onClose={() => setSheet(null)} booking={b} />
      <RescheduleSheet open={sheet === 'reschedule'} onClose={() => setSheet(null)} booking={b} />
    </Screen>
  );
}

function CancelSheet({ open, onClose, booking }: { open: boolean; onClose: () => void; booking: Booking }) {
  const [reason, setReason] = useState('');
  const act = useAction(() => api.post(`/customer/bookings/${booking._id}/cancel`, { reason: reason.trim() }), {
    success: 'Visit cancelled',
    invalidate: [['booking', booking._id], ['bookings'], ['home']],
    onDone: onClose,
  });
  return (
    <Sheet open={open} onClose={onClose} title="Cancel this visit?" footer={<Button title="Cancel visit" variant="dangerSolid" loading={act.isPending} disabled={reason.trim().length < 3} onPress={async () => (await confirm('Cancel visit', 'Are you sure?', 'Cancel visit', true)) && act.mutate()} />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.md }}>
        {['Parent is unwell / in hospital', 'Parent is travelling', 'Booked by mistake', 'Need a different time'].map((r) => (
          <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </View>
      <Field label="Reason"><Input value={reason} onChangeText={setReason} multiline /></Field>
    </Sheet>
  );
}

function RescheduleSheet({ open, onClose, booking }: { open: boolean; onClose: () => void; booking: Booking }) {
  const today = istDate();
  const [date, setDate] = useState(addDays(today, 1));
  const [time, setTime] = useState(booking.scheduledLocal?.time ?? '10:00');
  const ok = (d: string, t: string) => istToDate(d, t).getTime() >= Date.now() + 3 * 3600000;
  const act = useAction(() => api.post(`/customer/bookings/${booking._id}/reschedule`, { date, time, reason: 'Changed by family' }), {
    success: 'Visit moved. Our team will confirm it again.',
    invalidate: [['booking', booking._id], ['bookings'], ['home']],
    onDone: onClose,
  });
  const slots = SLOTS.filter((s) => ok(date, s));
  return (
    <Sheet open={open} onClose={onClose} title="Change date or time" footer={<Button title={`Move to ${ymdLabel(date)}, ${hhmmLabel(time)}`} loading={act.isPending} disabled={!ok(date, time)} onPress={() => act.mutate()} />}>
      <Field label="New date (India time)"><DateInput value={date} onChange={setDate} minimumDate={new Date()} maximumDate={new Date(Date.now() + 119 * 86400000)} /></Field>
      <Field label="New time (India time)">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
          {slots.map((s) => <Chip key={s} label={hhmmLabel(s)} selected={time === s} onPress={() => setTime(s)} />)}
          {!slots.length && <T v="small">No times left on this day.</T>}
        </View>
      </Field>
      <Notice tone="info" title="The visit will be confirmed again" body="Your care assistant may change after moving the visit." />
    </Sheet>
  );
}
