import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { ageFrom, visitTime } from '@/lib/format';
import { C, S } from '@/lib/theme';
import type { Parent } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorView, Loading, Screen, T } from '@/components/ui';
import { OverallBadge } from '@/components/status';

export default function Parents() {
  const q = useQuery({ queryKey: ['parents'], queryFn: () => api.get<Parent[]>('/customer/parents') });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const list = q.data || [];
  return (
    <Screen tabbed refreshing={q.isRefetching} onRefresh={() => q.refetch()} footer={list.length ? <Button title="Add a parent" icon="add" variant="secondary" onPress={() => router.push('/parent/new')} /> : undefined}>
      {list.length === 0 ? (
        <Empty icon="heart-outline" title="No parents added yet" body="Add a parent to book home visits and see their health records." action={<Button title="Add a parent" onPress={() => router.push('/parent/new')} />} />
      ) : (
        <View style={{ gap: S.md }}>
          {list.map((p) => (
            <Card key={p._id} onPress={() => router.push(`/parent/${p._id}`)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <T v="title" color={C.brandDark}>{p.fullName[0]}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="heading">{p.fullName}</T>
                  <T v="small">
                    {ageFrom(p.dateOfBirth)} yrs · {p.address?.city}
                    {p.relationToOwner ? ` · ${p.relationToOwner}` : ''}
                  </T>
                </View>
                <Ionicons name="chevron-forward" size={20} color={C.faint} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.md }}>
                <OverallBadge status={p.lastOverallStatus} />
                {!p.access?.isOwner && <Badge label={`Shared with you · ${p.access?.permissions?.includes('BOOK') ? 'can book' : 'view only'}`} tone="info" icon="people" />}
              </View>
              {p.nextVisit && <T v="small" style={{ marginTop: S.sm }}>Next visit: {visitTime(p.nextVisit.scheduledAt).main}</T>}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
