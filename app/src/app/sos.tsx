import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { currentCoords } from '@/lib/tracker';
import { visitTime } from '@/lib/format';
import { C, S } from '@/lib/theme';
import type { Booking, Job } from '@/lib/types';
import { Button, Card, Chip, Field, Input, Notice, Screen, T } from '@/components/ui';

const EMERGENCY = '112';
const ACTIVE = ['ASSISTANT_ACCEPTED', 'ON_THE_WAY', 'REACHED', 'VISIT_STARTED'];

/** Emergency: call 112 first, then alert the Care Elders India care desk (which calls back and escalates). */
export default function Sos() {
  const { user } = useAuth();
  const isAssistant = user?.role === 'ASSISTANT';
  const [message, setMessage] = useState('');
  const [bookingId, setBookingId] = useState<string | undefined>();
  const [sent, setSent] = useState(false);

  const visits = useQuery({
    queryKey: ['sos-visits', user?.role],
    queryFn: async () => {
      if (isAssistant) return (await api.page<Job>('/assistant/jobs?scope=today')).items.filter((j) => ACTIVE.includes(j.status)).map((j) => ({ id: j._id, label: `${j.patient.name}, ${visitTime(j.scheduledAt).main}` }));
      return (await api.page<Booking>('/customer/bookings?scope=upcoming&limit=10')).items.filter((b) => ACTIVE.includes(b.status)).map((b) => ({ id: b._id, label: `${b.parentSnapshot.fullName}, ${visitTime(b.scheduledAt).main}` }));
    },
  });

  const send = useAction(
    async () => {
      const c = await currentCoords().catch(() => null);
      return api.post('/emergency/sos', { bookingId, message: message.trim() || undefined, latitude: c?.latitude, longitude: c?.longitude });
    },
    { onDone: () => setSent(true) }
  );

  if (sent)
    return (
      <Screen footer={<Button title="Done" onPress={() => router.back()} />}>
        <Notice tone="ok" icon="checkmark-circle" title="The care desk has been alerted" body="Someone will call you within minutes. If anyone is in danger, call 112 now." />
        <Button title={`Call ${EMERGENCY}`} variant="dangerSolid" icon="call" style={{ marginTop: S.xl }} onPress={() => Linking.openURL(`tel:${EMERGENCY}`)} />
      </Screen>
    );

  return (
    <Screen>
      <Card tone="danger">
        <T v="heading" color={C.danger}>Is someone in immediate danger?</T>
        <T style={{ marginTop: 4 }}>Call emergency services first. Care Elders India does not replace an ambulance.</T>
        <Button title={`Call ${EMERGENCY} (India emergency)`} variant="dangerSolid" icon="call" style={{ marginTop: S.md }} onPress={() => Linking.openURL(`tel:${EMERGENCY}`)} />
      </Card>

      <T v="heading" style={{ marginTop: S.xl, marginBottom: S.sm }}>Alert the Care Elders India care desk</T>
      <T v="small" style={{ marginBottom: S.lg }}>We&apos;ll call you back, contact the family and help arrange care.{isAssistant ? ' Your location is shared with the alert.' : ''}</T>
      {!!visits.data?.length && (
        <Field label="Which visit is this about?">
          <View style={{ gap: S.sm }}>
            {visits.data.map((v) => <Chip key={v.id} label={v.label} selected={bookingId === v.id} onPress={() => setBookingId(bookingId === v.id ? undefined : v.id)} />)}
          </View>
        </Field>
      )}
      <Field label="What is happening? (optional)"><Input value={message} onChangeText={setMessage} multiline placeholder="e.g. Mother fell and can't stand up" /></Field>
      <Button title="Send alert to care desk" icon="alert-circle" variant="dangerSolid" loading={send.isPending} onPress={() => send.mutate()} />
    </Screen>
  );
}
