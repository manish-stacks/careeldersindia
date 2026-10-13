import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { visitTime } from '@/lib/format';
import { C, S } from '@/lib/theme';
import type { Booking } from '@/lib/types';
import { Button, Card, Empty, ErrorView, Loading, Segmented, T } from '@/components/ui';
import { StatusBadge } from '@/components/status';
import { FilterBar, LIST_PERF, PAST_DATES, UPCOMING_DATES, dateRange, useDebounced, type DateKey } from '@/components/filters';

export default function Visits() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState<DateKey>('any');
  const term = useDebounced(search.trim());
  const filtered = !!term || date !== 'any';
  const q = useInfiniteQuery({
    queryKey: ['bookings', scope, term, date],
    placeholderData: (prev) => prev,
    queryFn: ({ pageParam }) => api.page<Booking>(`/customer/bookings${qs({ scope, q: term || undefined, ...dateRange(date), page: pageParam, limit: 20 })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) || [];

  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ padding: S.lg, paddingBottom: S.sm }}>
        <Segmented value={scope} onChange={(v) => { setScope(v); setDate('any'); }} items={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
        <View style={{ marginTop: S.sm }}>
          <FilterBar search={search} onSearch={setSearch} placeholder="Search by name or visit number" dates={scope === 'upcoming' ? UPCOMING_DATES : PAST_DATES} date={date} onDate={setDate} />
        </View>
      </View>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b._id}
          contentContainerStyle={{ padding: S.lg, paddingTop: S.sm, gap: S.sm }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.brand} />}
          {...LIST_PERF}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={C.brand} style={{ padding: S.lg }} /> : null}
          ListEmptyComponent={
            <Empty
              icon="calendar-outline"
              title={filtered ? 'No visits match your filters' : scope === 'upcoming' ? 'No upcoming visits' : 'No past visits yet'}
              action={scope === 'upcoming' && !filtered ? <Button title="Book a visit" onPress={() => router.push('/book')} /> : undefined}
            />
          }
          renderItem={({ item: b }) => {
            const t = visitTime(b.scheduledAt);
            return (
              <Card onPress={() => router.push(`/booking/${b._id}`)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
                  <T v="heading" style={{ flex: 1 }}>{b.parentSnapshot.fullName}</T>
                  <StatusBadge status={b.status} />
                </View>
                <T>{b.serviceSnapshot.name}</T>
                <T v="small" style={{ marginTop: 4 }}>{t.main}</T>
                {t.local ? <T v="caption">{t.local}</T> : null}
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
