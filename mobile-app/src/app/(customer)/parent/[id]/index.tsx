import { useState } from 'react';
import { useWindowDimensions, View, Linking } from 'react-native';
import { useToast } from '@/components/toast';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api, fixUrl } from '@/lib/api';
import { useAction, confirm } from '@/lib/hooks';
import { ageFrom, dateLong, humanize } from '@/lib/format';
import { C, S } from '@/lib/theme';
import type { OverallStatus, Parent } from '@/lib/types';
import { Badge, Button, Card, ErrorView, KV, Loading, Row, Screen, Section, T } from '@/components/ui';
import { OverallBadge } from '@/components/status';
import { Trend } from '@/components/sparkline';

type Pt = { value: number; unit: string; recordedAt: string };
type History = { reports: { _id: string; reportNumber: string; visitDate: string; overallStatus: OverallStatus; serviceName: string; followUpRequired?: boolean }[]; series: Record<string, Pt[]> };

export default function ParentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const q = useQuery({ queryKey: ['parent', id], queryFn: () => api.get<Parent>(`/customer/parents/${id}`) });
  const h = useQuery({ queryKey: ['parent', id, 'history'], queryFn: () => api.get<History>(`/customer/parents/${id}/health-history?limit=30`) });
  const [sheetBusy, setSheetBusy] = useState<'xlsx' | 'pdf' | ''>('');
  async function downloadSheet(format: 'xlsx' | 'pdf') {
    setSheetBusy(format);
    try {
      const month = new Date().toISOString().slice(0, 7);
      const r = await api.get<{ url: string }>(`/customer/parents/${id}/sheet-link?month=${month}&format=${format}`);
      await Linking.openURL(fixUrl(r.url)!);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create the sheet', 'error');
    } finally {
      setSheetBusy('');
    }
  }
  const remove = useAction(() => api.del(`/customer/parents/${id}`), { success: 'Removed', invalidate: [['parents'], ['home']], onDone: () => router.back() });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  const perms = p.access?.permissions || [];
  const canBook = p.access?.isOwner || perms.includes('BOOK');
  const canManage = p.access?.isOwner || perms.includes('MANAGE');
  const s = h.data?.series || {};
  const last = (k: string, n = 12) => (s[k] || []).slice(-n);
  const w = width - S.lg * 4;
  const hasTrends = ['BP_SYSTOLIC', 'PULSE', 'SPO2', 'BLOOD_SUGAR', 'WEIGHT', 'TEMPERATURE'].some((k) => (s[k] || []).length);

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => { q.refetch(); h.refetch(); }} footer={canBook ? <Button title="Book a visit" icon="add-circle-outline" onPress={() => router.push({ pathname: '/book', params: { parentId: id } })} /> : undefined}>
      <Stack.Screen options={{ title: p.fullName }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <T v="display" color={C.brandDark}>{p.fullName[0]}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T v="title">{p.fullName}</T>
          <T v="small">{ageFrom(p.dateOfBirth)} yrs · {humanize(p.gender)}{p.bloodGroup && p.bloodGroup !== 'UNKNOWN' ? ` · ${p.bloodGroup}` : ''}</T>
          <View style={{ marginTop: 6 }}><OverallBadge status={p.lastOverallStatus} /></View>
        </View>
      </View>

      <Section title="Daily / monthly sheet">
        <Card>
          <T v="small" style={{ marginBottom: S.sm }}>Download everything recorded at home visits, day by day, for the current month.</T>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Button title="Excel" icon="grid-outline" loading={sheetBusy === 'xlsx'} style={{ flex: 1 }} onPress={() => downloadSheet('xlsx')} />
            <Button title="PDF" icon="document-outline" variant="secondary" loading={sheetBusy === 'pdf'} style={{ flex: 1 }} onPress={() => downloadSheet('pdf')} />
          </View>
        </Card>
      </Section>

      <Section title="Recorded trends">
        <Card>
          {hasTrends ? (
            <>
              <Trend title="Blood pressure" unit="mmHg" series={last('BP_SYSTOLIC')} second={last('BP_DIASTOLIC')} width={w} />
              <Trend title="Pulse" unit="bpm" series={last('PULSE')} width={w} />
              <Trend title="Oxygen (SpO₂)" unit="%" series={last('SPO2')} width={w} />
              <Trend title="Blood sugar" unit="mg/dL" series={last('BLOOD_SUGAR')} width={w} />
              <Trend title="Weight" unit="kg" series={last('WEIGHT')} width={w} />
              <Trend title="Temperature" unit="°F" series={last('TEMPERATURE')} width={w} />
              <T v="caption">Readings recorded by care assistants at home visits. Not a medical diagnosis.</T>
            </>
          ) : (
            <T v="small">{h.isLoading ? 'Loading…' : 'Trends appear after the first visit.'}</T>
          )}
        </Card>
      </Section>

      {!!h.data?.reports.length && (
        <Section title="Reports">
          <Card style={{ paddingVertical: 0 }}>
            {h.data.reports.slice(0, 6).map((r, i, a) => (
              <Row key={r._id} title={r.serviceName} subtitle={dateLong(r.visitDate)} right={<OverallBadge status={r.overallStatus} />} onPress={() => router.push(`/report/${r._id}`)} last={i === a.length - 1} />
            ))}
          </Card>
        </Section>
      )}

      <Section title="Care profile" action={canManage ? <Button title="Edit" size="md" variant="ghost" onPress={() => router.push(`/parent/${id}/edit`)} /> : undefined}>
        <Card>
          <KV label="Address" value={`${p.address.line1}${p.address.line2 ? `, ${p.address.line2}` : ''}, ${p.address.city} ${p.address.pincode}`} />
          {p.mobile ? <KV label="Phone" value={p.mobile} /> : null}
          <KV label="Conditions" value={p.medicalConditions.join(', ') || 'None listed'} />
          <KV label="Allergies" value={p.allergies.length ? <T weight="semibold" color={C.danger} style={{ flexShrink: 1, textAlign: 'right' }}>{p.allergies.join(', ')}</T> : 'None listed'} />
          {p.specialInstructions ? <KV label="Instructions" value={p.specialInstructions} /> : null}
        </Card>
      </Section>

      {p.medicines.length > 0 && (
        <Section title="Medicines">
          <Card>
            {p.medicines.map((m, i) => (
              <View key={i} style={{ paddingVertical: 6 }}>
                <T weight="semibold">{m.name} <T v="small">{m.dosage}</T></T>
                <T v="small">{Object.entries(m.schedule || {}).filter(([, v]) => v).map(([k]) => humanize(k)).join(', ') || 'As needed'}</T>
              </View>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Emergency contacts">
        <Card style={{ paddingVertical: 0 }}>
          {p.emergencyContacts.map((c, i) => (
            <Row key={c.mobile} icon="call-outline" title={`${c.name}${c.relation ? ` (${c.relation})` : ''}`} subtitle={c.mobile} onPress={() => Linking.openURL(`tel:${c.mobile}`)} last={i === p.emergencyContacts.length - 1} />
          ))}
        </Card>
      </Section>

      {canManage && (
        <Section title="Family">
          <Card style={{ paddingVertical: 0 }}>
            <Row icon="people-outline" title="Family access" subtitle={`${(p.family || []).filter((f) => f.status !== 'REVOKED').length} people can see this profile`} onPress={() => router.push(`/parent/${id}/family`)} last />
          </Card>
        </Section>
      )}
      {!p.access?.isOwner && <View style={{ marginTop: S.lg }}><Badge label={`Shared with you: ${perms.map((x) => x.toLowerCase()).join(', ')}`} tone="info" icon="people" /></View>}

      {p.access?.isOwner && (
        <Button
          title="Remove this parent"
          variant="danger"
          size="md"
          style={{ marginTop: S.xxl }}
          loading={remove.isPending}
          onPress={async () => (await confirm('Remove parent?', 'Upcoming visits must be cancelled first. Past reports stay available to our care team.', 'Remove', true)) && remove.mutate()}
        />
      )}
    </Screen>
  );
}
