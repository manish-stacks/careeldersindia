import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { dateFull, humanize, inr } from '@/lib/format';
import { C, S } from '@/lib/theme';
import type { Payment } from '@/lib/types';
import { Badge, Card, Empty, ErrorView, Loading, T } from '@/components/ui';
import { LIST_PERF } from '@/components/filters';

type Row = Payment & { bookingId?: { bookingNumber: string } | null; recurringPlanId?: { planNumber: string } | null };

export default function Payments() {
  const q = useInfiniteQuery({
    queryKey: ['payments'],
    queryFn: ({ pageParam }) => api.page<Row>(`/customer/payments${qs({ page: pageParam, limit: 20 })}`),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.totalPages ? l.meta.page + 1 : undefined),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data?.pages.flatMap((p) => p.items) || [];
  return (
    <FlatList
      style={{ backgroundColor: C.canvas }}
      data={items}
      keyExtractor={(p) => p._id}
      contentContainerStyle={{ padding: S.lg, gap: S.sm, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.brand} />}
      {...LIST_PERF}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
      ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={C.brand} style={{ padding: S.lg }} /> : null}
      ListEmptyComponent={<Empty icon="card-outline" title="No payments yet" />}
      renderItem={({ item: p }) => (
        <Card>
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
      )}
    />
  );
}
