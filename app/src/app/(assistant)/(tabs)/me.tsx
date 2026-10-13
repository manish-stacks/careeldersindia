import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/hooks';
import { humanize } from '@/lib/format';
import { S } from '@/lib/theme';
import type { AssistantDoc, AssistantProfile, User } from '@/lib/types';
import { Badge, Card, ErrorView, Loading, Row, Screen, T } from '@/components/ui';

type ProfileRes = { user: Pick<User, '_id' | 'name' | 'email' | 'mobile'>; profile: AssistantProfile; documents: AssistantDoc[] };

export default function Me() {
  const { signOut } = useAuth();
  const q = useQuery({ queryKey: ['assistant-profile'], queryFn: () => api.get<ProfileRes>('/assistant/profile') });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const { user, profile: p, documents } = q.data;
  const v = p.verificationStatus;
  return (
    <Screen tabbed refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <T v="title">{user.name}</T>
      <T v="small">{user.email} · {user.mobile}</T>
      <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.sm, flexWrap: 'wrap' }}>
        <Badge label={v === 'APPROVED' ? 'Verified' : humanize(v)} tone={v === 'APPROVED' ? 'ok' : v === 'REJECTED' ? 'danger' : 'warn'} icon={v === 'APPROVED' ? 'shield-checkmark' : 'time-outline'} />
        {!!p.rating?.count && <Badge label={`★ ${p.rating.avg.toFixed(1)} (${p.rating.count})`} tone="neutral" />}
        <Badge label={`${p.stats?.completedVisits ?? 0} visits`} tone="neutral" />
      </View>
      <Card style={{ paddingVertical: 0, marginTop: S.xl }}>
        <Row icon="document-attach-outline" title="Documents" subtitle={`${documents.length} uploaded${documents.some((d) => d.status === 'REJECTED') ? ' · action needed' : ''}`} onPress={() => router.push('/documents')} />
        <Row icon="time-outline" title="Availability" subtitle={p.workingHours.length ? `${p.workingHours.length} working days` : 'Set your working hours'} onPress={() => router.push('/availability')} />
        <Row icon="create-outline" title="Profile, areas and bank" subtitle={p.serviceAreas.map((a) => a.city).join(', ') || 'Add service areas'} onPress={() => router.push('/profile-edit')} last />
      </Card>
      <Card style={{ paddingVertical: 0, marginTop: S.lg }}>
        <Row icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} />
        <Row icon="key-outline" title="Change password" onPress={() => router.push('/change-password')} />
        <Row icon="warning-outline" title="Emergency help" danger onPress={() => router.push('/sos')} last />
      </Card>
      <Card style={{ paddingVertical: 0, marginTop: S.lg }}>
        <Row icon="log-out-outline" title="Sign out" danger last onPress={async () => (await confirm('Sign out?', 'You will stop receiving visit requests on this phone.', 'Sign out')) && signOut()} />
      </Card>
      <T v="caption" style={{ textAlign: 'center', marginTop: S.xl }}>Care Elders India {Constants.expoConfig?.version}</T>
    </Screen>
  );
}
