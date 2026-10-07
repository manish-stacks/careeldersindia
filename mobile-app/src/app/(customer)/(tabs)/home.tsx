import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useSocket } from '@/lib/socket';
import { ageFrom, dateLong, inr, relative, visitTime } from '@/lib/format';
import { C, S } from "@/lib/theme";
import type { Booking, OverallStatus, ReportRow } from '@/lib/types';
import { Button, Card, Empty, ErrorView, IconButton, Loading, Notice, Screen, Section, T } from '@/components/ui';
import { BOOKING, OverallBadge, StatusBadge } from '@/components/status';

type Home = {
  greetingName: string;
  parents: { _id: string; fullName: string; dateOfBirth: string; age?: number; lastVisitAt?: string; lastOverallStatus?: OverallStatus; relationToOwner?: string }[];
  upcoming: Booking[];
  pendingPayments: Booking[];
  expiringPlans?: { _id: string; planNumber: string; parentName?: string; endsAt: string; daysLeft: number }[];
  recentReports: (ReportRow & { data?: { patient?: { name: string } } })[];
};

const LIVE = ['ON_THE_WAY', 'REACHED', 'VISIT_STARTED'];

export default function CustomerHome() {
  const insets = useSafeAreaInsets();
  const { connected } = useSocket();
  const q = useQuery({ queryKey: ['home'], queryFn: () => api.get<Home>('/customer/home'), refetchInterval: 60_000 });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const h = q.data;
  const live = h.upcoming.find((b) => LIVE.includes(b.status));
  const next = h.upcoming.filter((b) => b !== live);

  return (
    <Screen tabbed refreshing={q.isRefetching} onRefresh={() => q.refetch()} padded={false}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <View style={{ flex: 1 }}>
          <T v="small">Namaste,</T>
          <T v="display">{h.greetingName}</T>
        </View>
        <IconButton icon="notifications-outline" label="Notifications" onPress={() => router.push('/notifications')} bg={C.card} />
        <IconButton icon="warning-outline" label="Emergency help" color={C.danger} onPress={() => router.push('/sos')} bg={C.dangerSoft} />
      </View>

      <View style={{ paddingHorizontal: S.lg }}>
        {!connected && <T v="caption" style={{ marginBottom: S.sm }}>Offline: updates will appear when you reconnect.</T>}

        {live && (
          <Card onPress={() => router.push(`/booking/${live._id}`)} style={styles.live}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
              <View style={styles.pulse} />
              <T weight="semibold" color="#fff">
                {BOOKING[live.status].family}
              </T>
            </View>
            <T v="title" color="#fff" style={{ marginTop: S.sm }}>
              {live.parentSnapshot.fullName}
            </T>
            <T color="#FBE3E1">
              {live.serviceSnapshot.name}
              {live.assistant?.name ? ` with ${live.assistant.name}` : ''}
            </T>
            <T weight="semibold" color="#fff" style={{ marginTop: S.md }}>
              {live.status === 'VISIT_STARTED' ? 'See progress' : 'Track live'} ›
            </T>
          </Card>
        )}

        {h.pendingPayments.map((b) => (
          <Notice
            key={b._id}
            tone="warn"
            icon="card-outline"
            title={`Payment pending: ${b.parentSnapshot.fullName}`}
            body={`${b.serviceSnapshot.name} on ${visitTime(b.scheduledAt).main}. Not confirmed until paid.`}
            action={<Button title={`Pay ${inr(b.price.amount)}`} size="md" onPress={() => router.push({ pathname: '/pay', params: { bookingId: b._id } })} style={{ marginTop: S.sm, alignSelf: 'flex-start', paddingHorizontal: S.xl }} />}
          />
        ))}

        {(h.expiringPlans || []).map((p) => (
          <Notice key={p._id} tone="warn" icon="time-outline"
            title={p.daysLeft > 0 ? `Plan ${p.planNumber} ends in ${p.daysLeft} day${p.daysLeft > 1 ? 's' : ''}` : `Plan ${p.planNumber} has ended`}
            body={`${p.parentName ? `For ${p.parentName}. ` : ''}Contact the care desk to renew so daily visits continue without a break.`}
            action={<Pressable onPress={() => router.push(`/plan/${p._id}`)}><T color={C.brand} weight="semibold">View plan</T></Pressable>} />
        ))}

        <Section title="Your parents" action={h.parents.length ? <Pressable onPress={() => router.push('/parent/new')}><T color={C.brand} weight="semibold">+ Add</T></Pressable> : undefined}>
          {h.parents.length === 0 ? (
            <Card>
              <Empty icon="heart-outline" title="Add your first parent" body="Tell us who we'll be visiting, their address and any health details our care assistant should know." action={<Button title="Add a parent" onPress={() => router.push('/parent/new')} />} />
            </Card>
          ) : (
            <View style={{ gap: S.sm }}>
              {h.parents.map((p) => (
                <Card key={p._id} onPress={() => router.push(`/parent/${p._id}`)} style={styles.parent}>
                  <View style={styles.avatar}>
                    <T v="heading" color={C.brandDark}>{p.fullName[0]}</T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="heading">{p.fullName}</T>
                    <T v="small">
                      {p.age ?? ageFrom(p.dateOfBirth)} yrs{p.lastVisitAt ? ` · last visit ${relative(p.lastVisitAt)}` : ' · no visits yet'}
                    </T>
                    {p.lastOverallStatus && <View style={{ marginTop: 6 }}><OverallBadge status={p.lastOverallStatus} /></View>}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={C.faint} />
                </Card>
              ))}
            </View>
          )}
        </Section>

        {h.parents.length > 0 && <Button title="Book a visit" icon="add-circle-outline" onPress={() => router.push('/book')} style={{ marginTop: S.lg }} />}

        <Section title="Coming up" action={next.length ? <Pressable onPress={() => router.push('/visits')}><T color={C.brand} weight="semibold">All visits</T></Pressable> : undefined}>
          {next.length === 0 ? (
            <T v="small">No upcoming visits.</T>
          ) : (
            <View style={{ gap: S.sm }}>
              {next.map((b) => {
                const t = visitTime(b.scheduledAt);
                return (
                  <Card key={b._id} onPress={() => router.push(`/booking/${b._id}`)}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
                      <T v="heading" style={{ flex: 1 }}>{b.parentSnapshot.fullName}</T>
                      <StatusBadge status={b.status} />
                    </View>
                    <T>{b.serviceSnapshot.name}</T>
                    <T v="small" style={{ marginTop: 4 }}>{t.main}</T>
                    {t.local ? <T v="caption">{t.local}</T> : null}
                  </Card>
                );
              })}
            </View>
          )}
        </Section>

        {h.recentReports.length > 0 && (
          <Section title="Latest reports">
            <Card style={{ paddingVertical: 4 }}>
              {h.recentReports.map((r, i) => (
                <Pressable key={r._id} onPress={() => router.push(`/report/${r._id}`)} style={[styles.reportRow, i < h.recentReports.length - 1 && styles.rowLine]}>
                  <View style={{ flex: 1 }}>
                    <T weight="semibold">{r.data?.patient?.name}</T>
                    <T v="small">{r.serviceName} · {dateLong(r.visitDate)}</T>
                  </View>
                  <OverallBadge status={r.overallStatus} />
                </Pressable>
              ))}
            </Card>
          </Section>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.lg, paddingBottom: S.lg },
  live: { backgroundColor: C.brand, borderColor: C.brand, marginBottom: S.md },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  parent: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.md },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
});
