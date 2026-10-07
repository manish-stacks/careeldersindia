import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { C, R, S } from '@/lib/theme';
import { Card, ErrorView, Loading, Screen, Section, T } from '@/components/ui';

type E = { months: { month: string; completedVisits: number }[] };
const label = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

export default function Earnings() {
  const q = useQuery({ queryKey: ['earnings'], queryFn: () => api.get<E>('/assistant/earnings?months=6') });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data.months;
  const max = Math.max(1, ...rows.map((r) => r.completedVisits));
  const total = rows.reduce((a, r) => a + r.completedVisits, 0);
  const thisMonth = rows[rows.length - 1];
  return (
    <Screen tabbed refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={{ flexDirection: 'row', gap: S.sm }}>
        <Card style={{ flex: 1 }}>
          <T v="small">This month</T>
          <T v="display">{thisMonth?.completedVisits ?? 0}</T>
          <T v="small">visits completed</T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T v="small">Last 6 months</T>
          <T v="display">{total}</T>
          <T v="small">visits completed</T>
        </Card>
      </View>
      <Section title="By month">
        <Card>
          {rows.length === 0 ? (
            <T v="small">Completed visits will show here.</T>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: S.sm }}>
              {rows.map((r) => (
                <View key={r.month} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <T v="caption" color={C.ink}>{r.completedVisits}</T>
                  <View style={{ width: '70%', height: `${Math.max(4, (r.completedVisits / max) * 80)}%`, backgroundColor: C.brand, borderRadius: R.sm, marginTop: 4 }} />
                  <T v="caption" style={{ marginTop: 4 }}>{label(r.month)}</T>
                </View>
              ))}
            </View>
          )}
        </Card>
      </Section>
      <T v="caption" style={{ marginTop: S.lg }}>Payouts are settled by ParentCare to your registered bank account. Contact the care desk for payout statements.</T>
    </Screen>
  );
}
