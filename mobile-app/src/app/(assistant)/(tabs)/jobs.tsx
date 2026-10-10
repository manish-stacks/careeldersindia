import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { dateLong, time } from '@/lib/format';
import { C, S } from '@/lib/theme';
import type { Job } from '@/lib/types';
import { useAction } from '@/lib/hooks';
import { Button, Card, Empty, ErrorView, Loading, Segmented, T } from '@/components/ui';
import { JobBadge } from '@/components/status';
import { FilterBar, LIST_PERF, PAST_DATES, UPCOMING_DATES, dateRange, useDebounced, type DateKey } from '@/components/filters';

type Scope = 'new' | 'upcoming' | 'history';

export default function Jobs() {
  const params = useLocalSearchParams<{ scope?: Scope }>();
  const [scope, setScope] = useState<Scope>(params.scope || 'upcoming');
  useEffect(() => {
    if (params.scope) setScope(params.scope);
  }, [params.scope]);
  const newCount = useQuery({ queryKey: ['jobs', 'new-count'], queryFn: () => api.page<Job>('/assistant/jobs?scope=new&limit=1') });
  const [search, setSearch] = useState('');
  const [date, setDate] = useState<DateKey>('any');
  const term = useDebounced(search.trim());
  const filtered = !!term || date !== 'any';
  useEffect(() => setDate('any'), [scope]);
  const q = useInfiniteQuery({
    queryKey: ['jobs', scope, term, date],
    placeholderData: (prev) => prev,
    queryFn: ({ pageParam }) => api.page<Job>(`/assistant/jobs${qs({ scope, q: term || undefined, ...dateRange(date), page: pageParam, limit: 20 })}`),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.totalPages ? l.meta.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) || [];
  // tick several new visits and accept them in one tap
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => setSel([]), [scope]);
  const pending = items.filter((j) => j.status === 'ASSISTANT_ASSIGNED').map((j) => j._id);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const acceptMany = useAction(() => api.post<{ accepted: number; results: { id: string; ok: boolean; message?: string }[] }>('/assistant/jobs/accept-many', { ids: sel }), {
    invalidate: [['jobs'], ['home']],
    success: (r) => `${r.accepted} accepted${r.results.length > r.accepted ? `, ${r.results.length - r.accepted} could not be accepted (${r.results.find((x) => !x.ok)?.message || 'time clash'})` : ''}`,
    onDone: () => setSel([]),
  });
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ padding: S.lg, paddingBottom: S.sm }}>
        <Segmented value={scope} onChange={setScope} items={[{ value: 'new', label: 'New', count: newCount.data?.meta.total }, { value: 'upcoming', label: 'Upcoming' }, { value: 'history', label: 'Past' }]} />
        <View style={{ marginTop: S.sm }}>
          <FilterBar search={search} onSearch={setSearch} placeholder="Search patient name or visit number" dates={scope === 'history' ? PAST_DATES : UPCOMING_DATES} date={date} onDate={setDate} />
        </View>
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
          {...LIST_PERF}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={C.brand} style={{ padding: S.lg }} /> : null}
          ListEmptyComponent={<Empty icon="briefcase-outline" title={filtered ? 'No visits match your filters' : scope === 'new' ? 'No new visits to accept' : scope === 'upcoming' ? 'No upcoming visits' : 'No past visits yet'} />}
          ListHeaderComponent={scope === 'new' && pending.length > 1 ? (
            <Pressable onPress={() => setSel(sel.length === pending.length ? [] : pending)} style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: S.xs }}>
              <Ionicons name={sel.length === pending.length ? 'checkbox' : 'square-outline'} size={22} color={C.brand} />
              <T weight="semibold">Select all ({pending.length})</T>
            </Pressable>
          ) : null}
          renderItem={({ item: j }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
              {scope === 'new' && j.status === 'ASSISTANT_ASSIGNED' ? (
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: sel.includes(j._id) }} onPress={() => toggle(j._id)} hitSlop={8}>
                  <Ionicons name={sel.includes(j._id) ? 'checkbox' : 'square-outline'} size={26} color={sel.includes(j._id) ? C.brand : C.muted} />
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }}>
            <Card onPress={() => (sel.length ? toggle(j._id) : router.push(`/job/${j._id}`))}>
              {(() => {
                const [wd, md = ''] = dateLong(j.scheduledAt).split(', ');
                const [mon, day] = md.split(' ');
                const gender = (j.patient as { gender?: string }).gender;
                return (
                  <View style={{ flexDirection: 'row', gap: S.md }}>
                    <View style={{ width: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: C.brandSoft, paddingVertical: S.sm }}>
                      <T v="caption" color={C.brandDark}>{wd}</T>
                      <T v="title" color={C.brandDark}>{day}</T>
                      <T v="caption" color={C.brandDark}>{mon}</T>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
                        <T v="heading" style={{ flex: 1 }} numberOfLines={1}>{j.patient.name}</T>
                        <JobBadge status={j.status} />
                      </View>
                      <T v="small">{[j.patient.age ? `${j.patient.age} yrs` : '', gender ? gender[0] + gender.slice(1).toLowerCase() : ''].filter(Boolean).join(' · ')}</T>
                      <T>{j.service.name}</T>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="time-outline" size={15} color={C.muted} />
                        <T v="small">{time(j.scheduledAt)}</T>
                        <Ionicons name="location-outline" size={15} color={C.muted} style={{ marginLeft: S.sm }} />
                        <T v="small" style={{ flex: 1 }} numberOfLines={1}>{[j.address.city, j.address.pincode].filter(Boolean).join(' ')}</T>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </Card>
              </View>
            </View>
          )}
        />
      )}
      {sel.length > 0 && (
        <View style={{ padding: S.lg, backgroundColor: C.canvas, borderTopWidth: 1, borderTopColor: C.line }}>
          <Button title={`Accept ${sel.length} visit${sel.length > 1 ? 's' : ''}`} icon="checkmark-done" loading={acceptMany.isPending} onPress={() => acceptMany.mutate(undefined)} />
        </View>
      )}
    </View>
  );
}
