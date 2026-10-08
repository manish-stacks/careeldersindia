import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { api, fixUrl } from '@/lib/api';
import { useAction, confirm } from '@/lib/hooks';
import { currentCoords, ensureBackgroundPermission, isAndroid, onTrackingChange, openAppSettings, startTracking, stopTracking, trackingBooking, trackingMode, type Mode } from '@/lib/tracker';
import { dateLong, humanize, time } from '@/lib/format';
import { C, S } from '@/lib/theme';
import type { Job } from '@/lib/types';
import { Badge, Button, Card, Chip, ErrorView, Field, Input, KV, Loading, Notice, Row, Screen, Section, Sheet, T } from '@/components/ui';
import { JobBadge } from '@/components/status';

const DONE = ['VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED'];

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => api.get<Job>(`/assistant/jobs/${id}`) });
  const [sheet, setSheet] = useState<null | 'reject' | 'noshow'>(null);
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<Mode>(trackingBooking() === id ? trackingMode() : null);
  useEffect(() => onTrackingChange((st) => setMode(st?.bookingId === id ? st.mode : null)), [id]);
  const tracking = !!mode;

  const inv = [['booking', id], ['jobs'], ['home']];
  const accept = useAction(() => api.post(`/assistant/jobs/${id}/accept`), { success: 'Visit accepted. The family has been told.', invalidate: inv });
  const reject = useAction(() => api.post(`/assistant/jobs/${id}/reject`, { reason: reason.trim() }), { success: 'Visit declined', invalidate: inv, onDone: () => router.back() });
  const travel = useAction(
    async () => {
      const r = await api.post(`/assistant/jobs/${id}/start-travel`);
      const m = await startTracking(id, q.data?.patient.name);
      return { r, m };
    },
    {
      success: (x) => (x.m === 'background' ? 'Trip started. Location is shared even if you close the app.' : x.m === 'foreground' ? 'Trip started. Keep the app open, or allow location "all the time".' : 'Trip started. Turn on location so the family can follow.'),
      invalidate: inv,
    }
  );
  const reached = useAction(
    async () => {
      const c = await currentCoords();
      await stopTracking();
      return api.post(`/assistant/jobs/${id}/reached`, c || {});
    },
    { success: 'Marked as arrived', invalidate: inv }
  );
  const resume = useAction(async () => startTracking(id, q.data?.patient.name), { success: (m) => (m ? 'Sharing your location again' : 'Location permission is off') });
  const upgrade = useAction(async () => {
    const ok = await ensureBackgroundPermission();
    if (!ok) {
      openAppSettings();
      return null;
    }
    await stopTracking();
    return startTracking(id, q.data?.patient.name);
  }, { success: (m) => (m === 'background' ? 'Now sharing even when the app is closed' : 'In Settings, set Location to "Allow all the time"') });
  const start = useAction(() => api.post(`/assistant/jobs/${id}/start-visit`), { invalidate: inv, onDone: () => router.push(`/visit/${id}`) });
  const noShow = useAction(() => api.post(`/assistant/jobs/${id}/no-show`, { reason: reason.trim() }), { success: 'Reported to the care team', invalidate: inv, onDone: () => setSheet(null) });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const j = q.data;
  const p = j.patient;
  const a = j.address;
  const addr = [a.line1, a.line2, a.landmark, `${a.city} ${a.pincode}`].filter(Boolean).join(', ');
  const navigate = () => {
    const dest = j.location ? `${j.location.lat},${j.location.lng}` : encodeURIComponent(addr);
    Linking.openURL(Platform.OS === 'ios' ? `maps://?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`));
  };

  const footer = (() => {
    switch (j.status) {
      case 'ASSISTANT_ASSIGNED':
        return (
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Button title="Decline" variant="secondary" style={{ flex: 1 }} onPress={() => { setReason(''); setSheet('reject'); }} />
            <Button title="Accept" style={{ flex: 2 }} loading={accept.isPending} onPress={() => accept.mutate()} />
          </View>
        );
      case 'ASSISTANT_ACCEPTED':
        return <Button title="Start travel" icon="navigate" loading={travel.isPending} onPress={async () => (await confirm('Start travel?', "The family will see you're on the way and follow your location until you arrive.", 'Start')) && travel.mutate()} />;
      case 'ON_THE_WAY':
        return <Button title="I've arrived" icon="location" loading={reached.isPending} onPress={() => reached.mutate()} />;
      case 'REACHED':
        return (
          <View style={{ gap: S.sm }}>
            <Button title="Start visit" icon="medkit" loading={start.isPending} onPress={() => start.mutate()} />
            <Button title="Nobody at home / can't do visit" variant="danger" size="md" onPress={() => { setReason(''); setSheet('noshow'); }} />
          </View>
        );
      case 'VISIT_STARTED':
        return <Button title="Continue recording" icon="create" onPress={() => router.push(`/visit/${id}`)} />;
      default:
        return undefined;
    }
  })();

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()} footer={footer}>
      <Stack.Screen options={{ title: j.bookingNumber }} />
      <JobBadge status={j.status} />
      <T v="title" style={{ marginTop: S.sm }}>{p.name}</T>
      <T>{p.age} yrs · {humanize(p.gender)}{p.bloodGroup && p.bloodGroup !== 'UNKNOWN' ? ` · ${p.bloodGroup}` : ''}</T>
      <T v="heading" style={{ marginTop: S.md }}>{dateLong(j.scheduledAt)}, {time(j.scheduledAt)}</T>
      <T v="small">{j.service.name} · about {j.durationMinutes} min</T>

      {mode === 'background' && (
        <View style={{ marginTop: S.md }}>
          <Notice tone="brand" icon="radio" title="Sharing your location" body={`Works with the app closed${isAndroid ? ' (keep the ParentCare notification)' : ''}. Stops when you tap “I've arrived”.`} action={isAndroid ? <Button title="Battery settings" variant="ghost" size="md" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={openAppSettings} /> : undefined} />
        </View>
      )}
      {mode === 'foreground' && (
        <View style={{ marginTop: S.md }}>
          <Notice tone="warn" icon="phone-portrait-outline" title="Sharing only while the app is open" body='Allow location "All the time" so the family can follow you with the app closed.' action={<Button title="Allow all the time" size="md" style={{ marginTop: S.sm, alignSelf: 'flex-start', paddingHorizontal: S.xl }} loading={upgrade.isPending} onPress={() => upgrade.mutate()} />} />
        </View>
      )}
      {!mode && j.status === 'ON_THE_WAY' && (
        <View style={{ marginTop: S.md }}>
          <Notice tone="danger" icon="location-outline" title="Location sharing is off" body="The family and care desk can't see you on the way." action={<Button title="Share my location" size="md" style={{ marginTop: S.sm, alignSelf: 'flex-start', paddingHorizontal: S.xl }} loading={resume.isPending} onPress={() => resume.mutate()} />} />
        </View>
      )}
      {DONE.includes(j.status) && (
        <View style={{ marginTop: S.md, gap: S.sm }}>
          <Notice tone="ok" title="Visit completed" body="Thank you. The report has been sent to the family." />
          {j.reportId ? <Button title="Download report (PDF)" icon="download-outline" variant="secondary" onPress={async () => { try { const r = await api.get<{ url: string }>(`/reports/${j.reportId}/pdf`); await WebBrowser.openBrowserAsync(fixUrl(r.url)!); } catch { /* shown by api layer */ } }} /> : null}
        </View>
      )}

      {!!p.allergies?.length && (
        <View style={{ marginTop: S.lg }}>
          <Notice tone="danger" title={`Allergies: ${p.allergies.join(', ')}`} />
        </View>
      )}

      <Section title="Address">
        <Card>
          <T>{addr}</T>
          <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.md }}>
            <Button title="Directions" icon="map-outline" size="md" variant="secondary" style={{ flex: 1 }} onPress={navigate} />
            {p.mobile ? <Button title="Call" icon="call-outline" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${p.mobile}`)} /> : null}
          </View>
        </Card>
      </Section>

      <Section title="Patient and family">
        <Card>
          <KV label="Patient" value={`${p.name}${p.age ? `, ${p.age}` : ''}`} />
          <KV label="Patient mobile" value={p.mobile || 'Not provided'} />
          {j.customer ? (
            <>
              <KV label="Booked by" value={j.customer.name} />
              {j.customer.mobile ? <KV label="Family mobile" value={j.customer.mobile} /> : null}
              {j.customer.email ? <KV label="Family email" value={j.customer.email} /> : null}
              {j.customer.mobile ? <Button title="Call family" icon="call-outline" size="md" variant="secondary" style={{ marginTop: S.sm }} onPress={() => Linking.openURL(`tel:${j.customer!.mobile}`)} /> : null}
            </>
          ) : null}
        </Card>
      </Section>

      <Section title="Health notes from family">
        <Card>
          <KV label="Conditions" value={p.medicalConditions?.join(', ') || 'None listed'} />
          {p.specialInstructions ? <KV label="Instructions" value={p.specialInstructions} /> : null}
          {j.customerNotes ? <KV label="Note for this visit" value={j.customerNotes} /> : null}
        </Card>
      </Section>

      {!!p.medicines?.length && (
        <Section title="Medicines">
          <Card>
            {p.medicines.map((m, i) => (
              <View key={i} style={{ paddingVertical: 4 }}>
                <T weight="semibold">{m.name} <T v="small">{m.dosage}</T></T>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {Object.entries(m.schedule || {}).filter(([, v]) => v).map(([k]) => <Badge key={k} label={humanize(k)} />)}
                </View>
              </View>
            ))}
          </Card>
        </Section>
      )}

      {!!p.emergencyContacts?.length && (
        <Section title="Emergency contacts">
          <Card style={{ paddingVertical: 0 }}>
            {p.emergencyContacts.map((c, i) => (
              <Row key={c.mobile} icon="call-outline" title={`${c.name}${c.relation ? ` (${c.relation})` : ''}`} subtitle={c.mobile} onPress={() => Linking.openURL(`tel:${c.mobile}`)} last={i === p.emergencyContacts!.length - 1} />
            ))}
          </Card>
        </Section>
      )}

      <Button title="Emergency help" variant="danger" icon="warning-outline" size="md" style={{ marginTop: S.xl }} onPress={() => router.push('/sos')} />

      <Sheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet === 'reject' ? 'Decline this visit?' : 'Report a missed visit'}
        footer={<Button title={sheet === 'reject' ? 'Decline' : 'Report'} variant="dangerSolid" disabled={reason.trim().length < 3} loading={reject.isPending || noShow.isPending} onPress={() => (sheet === 'reject' ? reject.mutate() : noShow.mutate())} />}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.md }}>
          {(sheet === 'reject' ? ['Not available at that time', 'Too far from me', 'Unwell today'] : ['No one answered the door', 'Family asked to cancel at the door', 'Patient refused the visit', 'Address could not be found']).map((r) => (
            <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        <Field label="Reason"><Input value={reason} onChangeText={setReason} multiline /></Field>
        {sheet === 'noshow' && <T v="small" color={C.muted}>Please call the family and the care desk before reporting a missed visit.</T>}
      </Sheet>
    </Screen>
  );
}
