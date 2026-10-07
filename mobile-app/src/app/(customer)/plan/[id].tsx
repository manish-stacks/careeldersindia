import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAction, confirm } from '@/lib/hooks';
import { dateLong, hhmmLabel, humanize, inr, time } from '@/lib/format';
import { C, S } from '@/lib/theme';
import type { BookingStatus, Plan } from '@/lib/types';
import { Badge, Button, Card, ErrorView, Field, Input, KV, Loading, Screen, Section, Sheet, T } from '@/components/ui';
import { StatusBadge } from '@/components/status';

type Detail = { plan: Plan; bookings: { _id: string; bookingNumber: string; scheduledAt: string; status: BookingStatus; occurrenceIndex: number }[]; schedulePreview: string[] };
const freq = (p: Plan) => (p.frequency === 'DAILY' ? 'Every day' : p.frequency === 'CUSTOM' ? `Every ${p.intervalDays} days` : p.frequency === 'BIWEEKLY' ? 'Every 2 weeks' : humanize(p.frequency));

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['plan', id], queryFn: () => api.get<Detail>(`/customer/recurring-plans/${id}`) });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const inv = [['plan', id], ['plans'], ['bookings'], ['home']];
  const pause = useAction(() => api.post(`/customer/recurring-plans/${id}/pause`), { success: 'Plan paused', invalidate: inv });
  const resume = useAction(() => api.post(`/customer/recurring-plans/${id}/resume`), { success: 'Plan resumed', invalidate: inv });
  const renew = useAction(() => api.post<{ plan: Plan }>(`/customer/recurring-plans/${id}/renew`), {
    success: 'Renewal created — complete payment to continue',
    invalidate: inv,
    onDone: (r) => router.push({ pathname: '/pay', params: { planId: r.plan._id } }),
  });
  const cancel = useAction(() => api.post<{ cancelledVisits: number; unusedVisits: number }>(`/customer/recurring-plans/${id}/cancel`, { reason: reason.trim() }), {
    success: (r) => `Plan cancelled. ${r.unusedVisits} unused visit${r.unusedVisits === 1 ? '' : 's'} will be refunded.`,
    invalidate: [...inv, ['payments']],
    onDone: () => setCancelOpen(false),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const { plan: p, bookings, schedulePreview } = q.data;
  const byIdx = new Map(bookings.map((b) => [b.occurrenceIndex, b]));

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Stack.Screen options={{ title: p.planNumber }} />
      <Badge label={humanize(p.status)} tone={p.status === 'ACTIVE' ? 'ok' : p.status === 'PAUSED' || p.status === 'PENDING_PAYMENT' ? 'warn' : 'neutral'} />
      <T v="title" style={{ marginTop: S.sm }}>{typeof p.parentId === 'object' ? p.parentId.fullName : ''}</T>
      <T>{typeof p.serviceId === 'object' ? p.serviceId.name : ''} · {freq(p)} at {hhmmLabel(p.timeOfDay)} IST</T>

      {p.status === 'PENDING_PAYMENT' && <Button title={`Pay ${inr(p.totalAmount)} to start`} onPress={() => router.push({ pathname: '/pay', params: { planId: p._id } })} style={{ marginTop: S.lg }} />}

      <Section title="Plan">
        <Card>
          <KV label="Period" value={`${dateLong(p.startDate)}${p.endDate ? ` → ${dateLong(p.endDate)}` : ''}`} />
          <KV label="Visits" value={`${p.totalVisits} (${p.generatedCount} scheduled so far)`} />
          <KV label="Per visit" value={inr(p.pricePerVisit)} />
          <KV label="Total paid" value={inr(p.totalAmount)} />
        </Card>
      </Section>

      <Section title="Schedule">
        <Card style={{ paddingVertical: 4 }}>
          {schedulePreview.map((at, i) => {
            const b = byIdx.get(i);
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: 10, borderBottomWidth: i < schedulePreview.length - 1 ? 1 : 0, borderBottomColor: C.line }}>
                <T weight="semibold" style={{ width: 28 }} color={b ? C.ink : C.faint}>{i + 1}</T>
                <T style={{ flex: 1 }} color={b ? C.ink : C.muted} onPress={b ? () => router.push(`/booking/${b._id}`) : undefined}>{dateLong(at)}, {time(at)}</T>
                {b ? <StatusBadge status={b.status} /> : <T v="caption">Not yet</T>}
              </View>
            );
          })}
        </Card>
        <T v="caption" style={{ marginTop: S.sm }}>Visits are created two weeks ahead. Each is checked and assigned like a single visit.</T>
      </Section>

      <View style={{ gap: S.sm, marginTop: S.xl }}>
        {p.status === 'ACTIVE' && <Button title="Pause plan" variant="secondary" loading={pause.isPending} onPress={async () => (await confirm('Pause plan?', 'No new visits will be created until you resume. Visits already scheduled stay.', 'Pause')) && pause.mutate()} />}
        {['ACTIVE', 'PAUSED', 'COMPLETED'].includes(p.status) && <Button title="Renew plan" loading={renew.isPending} onPress={() => renew.mutate()} />}
        {p.status === 'PAUSED' && <Button title="Resume plan" loading={resume.isPending} onPress={() => resume.mutate()} />}
        {['ACTIVE', 'PAUSED', 'PENDING_PAYMENT'].includes(p.status) && <Button title="Cancel plan" variant="danger" onPress={() => setCancelOpen(true)} />}
      </View>

      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel plan?" footer={<Button title="Cancel plan" variant="dangerSolid" loading={cancel.isPending} disabled={reason.trim().length < 3} onPress={() => cancel.mutate()} />}>
        <T style={{ marginBottom: S.md }}>Upcoming visits that haven&apos;t started are cancelled and unused visits are refunded to your original payment method.</T>
        <Field label="Reason"><Input value={reason} onChangeText={setReason} multiline /></Field>
      </Sheet>
    </Screen>
  );
}
