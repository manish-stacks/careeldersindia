import { useState } from 'react';
import { Share, View } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { api, fixUrl } from '@/lib/api';
import { dateTime, time } from '@/lib/format';
import { S } from '@/lib/theme';
import type { Report } from '@/lib/types';
import { Badge, Button, Card, ErrorView, KV, Loading, Screen, Section, T } from '@/components/ui';
import { VisitSummary } from '@/components/visit-summary';
import { useToast } from '@/components/toast';

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const q = useQuery({ queryKey: ['report', id], queryFn: () => api.get<Report>(`/reports/${id}`) });

  async function openPdf(share = false) {
    setOpening(true);
    try {
      const r = await api.get<{ url: string; fileName: string }>(`/reports/${id}/pdf`);
      const url = fixUrl(r.url)!;
      if (share) await Share.share({ message: `ParentCare visit report (link valid for 15 minutes): ${url}`, url });
      else await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not open PDF', 'error');
    } finally {
      setOpening(false);
    }
  }

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data;
  const latest = Math.max(r.version, ...(r.versions || []).map((v) => v.version));

  return (
    <Screen footer={<View style={{ flexDirection: 'row', gap: S.sm }}><Button title="Open PDF" icon="document-outline" loading={opening} onPress={() => openPdf()} style={{ flex: 1 }} /><Button title="Share" icon="share-outline" variant="secondary" onPress={() => openPdf(true)} style={{ flex: 1 }} /></View>}>
      <Stack.Screen options={{ title: r.reportNumber }} />
      <T v="title">{r.data.patient.name}</T>
      <T>{r.serviceName}</T>
      <T v="small">{dateTime(r.data.visit.startedAt)} to {time(r.data.visit.completedAt)} IST</T>
      {r.version > 1 && <View style={{ marginTop: S.sm }}><Badge label={`Updated (version ${r.version})`} tone="info" icon="create-outline" /></View>}
      {r.version < latest && (
        <Button title={`A newer version (v${latest}) exists`} variant="ghost" size="md" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => router.replace(`/report/${r.versions!.find((v) => v.version === latest)!._id}`)} />
      )}
      <Section title="Summary">
        <Card>
          <VisitSummary data={{ ...r.data, media: r.media, assistantName: r.data.assistant?.name, followUpRequired: r.data.followUp?.required, followUpNotes: r.data.followUp?.notes }} />
        </Card>
      </Section>
      <Section title="About this report">
        <Card>
          <KV label="Report no." value={r.reportNumber} />
          <KV label="Visit" value={r.data.visit.bookingNumber} />
          <KV label="Care assistant" value={r.data.assistant?.name} />
        </Card>
        <T v="caption" style={{ marginTop: S.md }}>{r.data.disclaimer}</T>
        <Button title="View the visit" variant="ghost" size="md" style={{ alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: S.sm }} onPress={() => router.push(`/booking/${r.bookingId}`)} />
      </Section>
    </Screen>
  );
}
