import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { dateLong } from '@/lib/format';
import { C, S } from '@/lib/theme';
import type { ReportRow } from '@/lib/types';
import { Badge, Card, Empty, ErrorView, Loading, T } from '@/components/ui';
import { LIST_PERF } from '@/components/filters';
import { OverallBadge } from '@/components/status';

export default function Reports() {
  const q = useInfiniteQuery({
    queryKey: ['reports'],
    queryFn: ({ pageParam }) => api.page<ReportRow>(`/reports${qs({ page: pageParam, limit: 20 })}`),
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
      keyExtractor={(r) => r._id}
      contentContainerStyle={{ padding: S.lg, gap: S.sm }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.brand} />}
      {...LIST_PERF}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
      ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={C.brand} style={{ padding: S.lg }} /> : null}
      ListEmptyComponent={<Empty icon="document-text-outline" title="No reports yet" body="After every visit you'll find the recorded measurements and notes here, with a PDF you can share with a doctor." />}
      renderItem={({ item: r }) => (
        <Card onPress={() => router.push(`/report/${r._id}`)}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
            <T v="heading" style={{ flex: 1 }}>{r.data?.patient?.name || r.serviceName}</T>
            <OverallBadge status={r.overallStatus} />
          </View>
          <T>{r.serviceName}</T>
          <T v="small" style={{ marginTop: 4 }}>{dateLong(r.visitDate)} · {r.reportNumber}{r.version && r.version > 1 ? ` (updated v${r.version})` : ''}</T>
          {r.followUpRequired ? <View style={{ marginTop: S.sm }}><Badge label="Follow-up suggested" tone="warn" /></View> : null}
        </Card>
      )}
    />
  );
}
