import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { dateLong, time } from '@/lib/format';
import { C, S } from '@/lib/theme';
import type { Job } from '@/lib/types';
import { Card, Empty, ErrorView, Loading, Segmented, T } from '@/components/ui';
import { JobBadge } from '@/components/status';

type Scope = 'new' | 'upcoming' | 'history';

export default function Jobs() {
  const params = useLocalSearchParams<{ scope?: Scope }>();
  const [scope, setScope] = useState<Scope>(params.scope || 'upcoming');
  useEffect(() => {
    if (params.scope) setScope(params.scope);
  }, [params.scope]);
  const newCount = useQuery({ queryKey: ['jobs', 'new-count'], queryFn: () => api.page<Job>('/assistant/jobs?scope=new&limit=1') });
  const q = useInfiniteQuery({
    queryKey: ['jobs', scope],
    queryFn: ({ pageParam }) => api.page<Job>(`/assistant/jobs${qs({ scope, page: pageParam, limit: 20 })}`),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.totalPages ? l.meta.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) || [];
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ padding: S.lg, paddingBottom: S.sm }}>
        <Segmented value={scope} onChange={setScope} items={[{ value: 'new', label: 'New', count: newCount.data?.meta.total }, { value: 'upcoming', label: 'Upcoming' }, { value: 'history', label: 'Past' }]} />
      </View>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(j) => j._id}
          contentContainerStyle={{ padding: S.lg, paddingTop: S.sm, gap: S.sm }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); newCount.refetch(); }} tintColor={C.brand} />}
          onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          ListEmptyComponent={<Empty icon="briefcase-outline" title={scope === 'new' ? 'No new visits to accept' : scope === 'upcoming' ? 'No upcoming visits' : 'No past visits yet'} />}
          renderItem={({ item: j }) => (
            <Card onPress={() => router.push(`/job/${j._id}`)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
                <T v="heading" style={{ flex: 1 }}>{j.patient.name}{j.patient.age ? `, ${j.patient.age}` : ''}</T>
                <JobBadge status={j.status} />
              </View>
              <T>{j.service.name}</T>
              <T v="small" style={{ marginTop: 4 }}>{dateLong(j.scheduledAt)}, {time(j.scheduledAt)} · {j.address.city} {j.address.pincode}</T>
            </Card>
          )}
        />
      )}
    </View>
  );
}
