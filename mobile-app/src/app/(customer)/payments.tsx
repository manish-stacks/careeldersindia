import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dateFull, humanize, inr } from '@/lib/format';
import { S } from '@/lib/theme';
import type { Payment } from '@/lib/types';
import { Badge, Card, Empty, ErrorView, Loading, Screen, T } from '@/components/ui';

type Row = Payment & { bookingId?: { bookingNumber: string } | null; recurringPlanId?: { planNumber: string } | null };

export default function Payments() {
  const q = useQuery({ queryKey: ['payments'], queryFn: () => api.page<Row>('/customer/payments?limit=50') });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data?.items || [];
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {items.length === 0 ? (
        <Empty icon="card-outline" title="No payments yet" />
      ) : (
        <View style={{ gap: S.sm }}>
          {items.map((p) => (
            <Card key={p._id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="heading">{inr(p.amount)}</T>
                <Badge label={humanize(p.status)} tone={p.status === 'CAPTURED' ? 'ok' : p.status === 'FAILED' ? 'danger' : p.status.includes('REFUND') ? 'info' : 'neutral'} />
              </View>
              <T v="small">
                {p.purpose === 'BOOKING' ? `Visit ${p.bookingId?.bookingNumber || ''}` : `Plan ${p.recurringPlanId?.planNumber || ''}`} · {dateFull(p.capturedAt || p.createdAt)}
              </T>
              <T v="caption">{p.receiptNumber}{p.method ? ` · ${humanize(p.method)}` : ''}</T>
              {p.refundedAmount > 0 && <T v="small" style={{ marginTop: 4 }}>Refunded {inr(p.refundedAmount)}. Refunds reach your account in 5–7 working days.</T>}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
