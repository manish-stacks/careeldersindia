import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dateLong, humanize, inr } from '@/lib/format';
import { C, R, S } from '@/lib/theme';
import type { Plan } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorView, Loading, Screen, T } from '@/components/ui';

const freqLabel = (p: Pick<Plan, 'frequency' | 'intervalDays'>) => (p.frequency === 'CUSTOM' ? `Every ${p.intervalDays} days` : p.frequency === 'BIWEEKLY' ? 'Every 2 weeks' : humanize(p.frequency));
const TONE: Record<string, 'ok' | 'warn' | 'neutral' | 'info'> = { ACTIVE: 'ok', PAUSED: 'warn', PENDING_PAYMENT: 'warn', COMPLETED: 'info', CANCELLED: 'neutral' };

export default function Plans() {
  const q = useQuery({ queryKey: ['plans'], queryFn: () => api.page<Plan>('/customer/recurring-plans?limit=50') });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data?.items || [];
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {items.length === 0 ? (
        <Empty icon="repeat-outline" title="No recurring plans" body="Book regular visits in one go and save on every visit." action={<Button title="Set up regular visits" onPress={() => router.push('/book')} />} />
      ) : (
        <View style={{ gap: S.sm }}>
          {items.map((p) => (
            <Card key={p._id} onPress={() => router.push(`/plan/${p._id}`)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
                <T v="heading" style={{ flex: 1 }}>{typeof p.parentId === 'object' ? p.parentId.fullName : ''}</T>
                <Badge label={humanize(p.status)} tone={TONE[p.status]} />
              </View>
              <T>{typeof p.serviceId === 'object' ? p.serviceId.name : ''} · {freqLabel(p)}</T>
              <View style={{ height: 8, backgroundColor: C.line, borderRadius: R.pill, marginTop: S.md, overflow: 'hidden' }}>
                <View style={{ width: `${(p.generatedCount / p.totalVisits) * 100}%`, height: 8, backgroundColor: C.brand }} />
              </View>
              <T v="small" style={{ marginTop: 4 }}>
                {p.generatedCount} of {p.totalVisits} visits scheduled · {inr(p.totalAmount)}
                {p.status === 'ACTIVE' && p.nextOccurrenceAt ? ` · next ${dateLong(p.nextOccurrenceAt)}` : ''}
              </T>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
