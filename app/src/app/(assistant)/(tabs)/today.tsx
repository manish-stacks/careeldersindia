import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/lib/socket';
import { useAction } from '@/lib/hooks';
import { firstName, humanize, time } from '@/lib/format';
import { C, R, S } from '@/lib/theme';
import type { AssistantProfile, Job } from '@/lib/types';
import { Button, Card, Empty, ErrorView, IconButton, Loading, Notice, Screen, Section, T, Toggle } from '@/components/ui';
import { NotifyPrompt } from '@/components/notify-prompt';
import { JobBadge } from '@/components/status';

type Home = { profile: Pick<AssistantProfile, 'verificationStatus' | 'isOnline' | 'isAvailable' | 'stats' | 'rating'>; todays: Job[]; counts: { today: number; completed: number; pending: number; awaitingAcceptance: number } };
const DONE = ['VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED', 'NO_SHOW'];

export default function Today() {
  const { user } = useAuth();
  const { connected } = useSocket();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ['home', 'assistant'], queryFn: () => api.get<Home>('/assistant/home'), refetchInterval: 60_000 });
  const avail = useAction((v: boolean) => api.put('/assistant/availability', { isAvailable: v }), { invalidate: [['home']] });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const { profile, todays, counts } = q.data;
  const next = todays.find((j) => !DONE.includes(j.status));
  const approved = profile.verificationStatus === 'APPROVED';

  return (
    <Screen tabbed padded={false} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <View style={{ flex: 1 }}>
          <T v="small">Namaste,</T>
          <T v="display">{firstName(user?.name)}</T>
        </View>
        <IconButton icon="notifications-outline" label="Notifications" onPress={() => router.push('/notifications')} bg={C.card} />
        <IconButton icon="warning-outline" label="Emergency" color={C.danger} bg={C.dangerSoft} onPress={() => router.push('/sos')} />
      </View>
      <View style={{ paddingHorizontal: S.lg, gap: S.md }}>
        {!approved && (
          <Notice
            tone={profile.verificationStatus === 'REJECTED' ? 'danger' : 'warn'}
            title={profile.verificationStatus === 'REJECTED' ? 'Verification not approved' : `Verification: ${humanize(profile.verificationStatus)}`}
            body={profile.verificationStatus === 'REJECTED' ? 'Please check your documents or call the care team.' : 'Upload your government ID. You will get visits once our team approves you.'}
            action={<Button title="Documents" size="md" variant="secondary" onPress={() => router.push('/documents')} style={{ marginTop: S.sm, alignSelf: 'flex-start', paddingHorizontal: S.xl }} />}
          />
        )}
        <NotifyPrompt />
        <Card>
          <Toggle label={profile.isAvailable ? 'Available for new visits' : 'Not taking new visits'} description={connected ? 'You are online' : 'Connecting…'} value={profile.isAvailable} onChange={(v) => avail.mutate(v)} />
        </Card>
        <View style={styles.stats}>
          <Stat n={counts.today} label="Today" />
          <Stat n={counts.completed} label="Done" />
          <Stat n={counts.awaitingAcceptance} label="To accept" hot={counts.awaitingAcceptance > 0} onPress={() => router.push({ pathname: '/jobs', params: { scope: 'new' } })} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {([
            { l: 'New visits', icon: 'briefcase', go: { pathname: '/jobs', params: { scope: 'new' } } },
            { l: 'Upcoming', icon: 'calendar', go: { pathname: '/jobs', params: { scope: 'upcoming' } } },
            { l: 'Earnings', icon: 'wallet', go: '/earnings' },
            { l: 'Documents', icon: 'document-text', go: '/documents' },
          ] as const).map((a) => (
            <Pressable key={a.l} onPress={() => router.push(a.go as never)} style={{ alignItems: 'center', gap: 6, width: '23%' }} accessibilityRole="button" accessibilityLabel={a.l}>
              <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={a.icon} size={24} color={C.brand} />
              </View>
              <T v="caption" color={C.ink}>{a.l}</T>
            </Pressable>
          ))}
        </View>

        {next && (
          <Card onPress={() => router.push(`/job/${next._id}`)} style={styles.next}>
            <T v="small" color="#DCEBF5">Next visit · {time(next.scheduledAt)}</T>
            <T v="title" color="#fff">{next.patient.name}</T>
            <T color="#DCEBF5">{next.address.line1}, {next.address.city}</T>
            <T weight="semibold" color="#fff" style={{ marginTop: S.md }}>
              {next.status === 'ASSISTANT_ASSIGNED' ? 'Review and accept ›' : next.status === 'ASSISTANT_ACCEPTED' ? 'Start travel ›' : next.status === 'VISIT_STARTED' ? 'Continue recording ›' : 'Open ›'}
            </T>
          </Card>
        )}
      </View>

      <View style={{ paddingHorizontal: S.lg }}>
        <Section title="Today's schedule">
          {todays.length === 0 ? (
            <Empty icon="sunny-outline" title="No visits today" body={approved ? 'New visits will appear here and you will get a notification.' : undefined} />
          ) : (
            <View style={{ gap: S.sm }}>
              {todays.map((j) => (
                <Card key={j._id} onPress={() => router.push(`/job/${j._id}`)} style={{ flexDirection: 'row', gap: S.md }}>
                  <View style={{ width: 64 }}>
                    <T v="heading">{time(j.scheduledAt).replace(/ (am|pm)/i, '')}</T>
                    <T v="caption">{/pm/i.test(time(j.scheduledAt)) ? 'PM' : 'AM'}</T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T weight="semibold">{j.patient.name}, {j.patient.age}</T>
                    <T v="small">{j.service.name} · {j.address.city}</T>
                    <View style={{ marginTop: 6 }}><JobBadge status={j.status} /></View>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </Section>
      </View>
    </Screen>
  );
}

function Stat({ n, label, hot, onPress }: { n: number; label: string; hot?: boolean; onPress?: () => void }) {
  return (
    <Card onPress={onPress} style={[{ flex: 1, alignItems: 'center', paddingVertical: S.md }, hot && { backgroundColor: C.warnSoft, borderColor: C.warn }]}>
      <T v="title" color={hot ? C.warn : C.ink}>{n}</T>
      <T v="small">{label}</T>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.lg, paddingBottom: S.lg },
  stats: { flexDirection: 'row', gap: S.sm },
  next: { backgroundColor: C.brand, borderColor: C.brand, borderRadius: R.lg },
});
