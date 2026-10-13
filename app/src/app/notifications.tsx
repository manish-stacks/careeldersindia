import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { relative } from '@/lib/format';
import { notificationTarget, openExternal } from '@/lib/links';
import { C, S } from '@/lib/theme';
import type { Notice as N } from '@/lib/types';
import { Button, Empty, ErrorView, Loading, T } from '@/components/ui';
import { LIST_PERF } from '@/components/filters';

export default function Notifications() {
  const { user } = useAuth();
  const q = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => api.page<N>(`/notifications${qs({ page: pageParam, limit: 30 })}`),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.totalPages ? l.meta.page + 1 : undefined),
  });
  const readAll = useAction(() => api.post('/notifications/read', { all: true }), { invalidate: [['notifications']] });
  const readOne = useAction((id: string) => api.post('/notifications/read', { ids: [id] }), { invalidate: [['notifications']] });

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data?.pages.flatMap((p) => p.items) || [];
  const unread = q.data?.pages[0]?.meta.unread || 0;

  const open = (n: N) => {
    if (!n.readAt) readOne.mutate(n._id);
    const t = notificationTarget(n.data, user?.role);
    if (!t) return;
    if ('external' in t) openExternal(t.external);
    else if (t.href !== '/notifications') router.push(t.href as never);
  };

  return (
    <FlatList
      style={{ backgroundColor: C.canvas }}
      data={items}
      keyExtractor={(n) => n._id}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.brand} />}
      {...LIST_PERF}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
      ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={C.brand} style={{ padding: S.lg }} /> : null}
      ListHeaderComponent={unread ? <View style={{ padding: S.lg, paddingBottom: 0 }}><Button title={`Mark all ${unread} as read`} variant="secondary" size="md" onPress={() => readAll.mutate()} /></View> : null}
      ListEmptyComponent={<Empty icon="notifications-outline" title="You're all caught up" />}
      renderItem={({ item: n }) => (
        <Pressable onPress={() => open(n)} style={({ pressed }) => ({ flexDirection: 'row', gap: S.md, padding: S.lg, backgroundColor: n.readAt ? C.canvas : C.brandSoft, borderBottomWidth: 1, borderBottomColor: C.line, opacity: pressed ? 0.8 : 1 })}>
          <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 7, backgroundColor: n.readAt ? 'transparent' : C.brand }} />
          <View style={{ flex: 1 }}>
            <T weight="semibold">{n.title}</T>
            <T v="small" color={C.inkSoft}>{n.body}</T>
            <T v="caption" style={{ marginTop: 4 }}>{relative(n.createdAt)}</T>
          </View>
        </Pressable>
      )}
    />
  );
}
