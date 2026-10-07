import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { addDays, hhmmLabel, inr, istDate, istToDate, ymdLabel, deviceTz, time as fmtTime, dateLong } from '@/lib/format';
import { C, R, S } from "@/lib/theme";
import type { Booking, Parent, Plan, Service } from '@/lib/types';
import { Button, Card, Choice, Chip, ErrorView, Field, Input, Loading, Notice, Screen, T, Toggle } from '@/components/ui';
import { DateInput } from '@/components/inputs';

const SLOTS = Array.from({ length: 27 }, (_, i) => {
  const m = 7 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}); // 07:00 … 20:00
const LEAD_MS = 3 * 3600 * 1000;
type Freq = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

export default function Book() {
  const params = useLocalSearchParams<{ parentId?: string; serviceId?: string }>();
  const parents = useQuery({ queryKey: ['parents'], queryFn: () => api.get<Parent[]>('/customer/parents') });
  const services = useQuery({ queryKey: ['services'], queryFn: () => api.get<Service[]>('/services') });

  const [parentId, setParentId] = useState(params.parentId || '');
  const [serviceId, setServiceId] = useState(params.serviceId || '');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [freq, setFreq] = useState<Freq>('WEEKLY');
  const [count, setCount] = useState(4);

  const bookable = (parents.data || []).filter((p) => p.access?.isOwner || p.access?.permissions?.includes('BOOK'));
  useEffect(() => {
    if (!parentId && bookable.length === 1) setParentId(bookable[0]._id);
  }, [bookable, parentId]);
  useEffect(() => {
    if (!serviceId && services.data?.length) setServiceId(services.data[0]._id);
  }, [services.data, serviceId]);

  const today = istDate();
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);
  const slotOk = (d: string, t: string) => istToDate(d, t).getTime() >= Date.now() + LEAD_MS;
  const daySlots = date ? SLOTS.filter((t) => slotOk(date, t)) : [];
  useEffect(() => {
    if (!date) setDate(days.find((d) => SLOTS.some((t) => slotOk(d, t))) || days[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (slot && date && !slotOk(date, slot)) setSlot('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const service = services.data?.find((s) => s._id === serviceId);
  const parent = bookable.find((p) => p._id === parentId);
  const perVisit = service ? (recurring ? Math.round(service.basePrice * (1 - service.recurringDiscountPercent / 100)) : service.basePrice) : 0;

  const preview = useQuery({
    queryKey: ['plan-preview', freq, date, slot, count],
    queryFn: () => api.get<{ dates: string[] }>(`/customer/recurring-plans/preview${qs({ frequency: freq, startDate: date, time: slot, totalVisits: count })}`),
    enabled: recurring && !!date && !!slot,
  });

  const create = useAction(
    async () => {
      if (recurring) {
        const r = await api.post<{ plan: Plan }>('/customer/recurring-plans', { parentId, serviceId, frequency: freq, startDate: date, time: slot, totalVisits: count, notes: notes.trim() || undefined });
        return { planId: r.plan._id };
      }
      const b = await api.post<Booking>('/customer/bookings', { parentId, serviceId, date, time: slot, customerNotes: notes.trim() || undefined });
      return { bookingId: b._id };
    },
    { invalidate: [['home'], ['bookings'], ['plans']], onDone: (r) => router.replace({ pathname: '/pay', params: r }) }
  );

  if (parents.isLoading || services.isLoading) return <Loading />;
  if (parents.isError || services.isError) return <ErrorView error={parents.error || services.error} onRetry={() => { parents.refetch(); services.refetch(); }} />;
  if (!bookable.length)
    return (
      <Screen>
        <Notice tone="info" title="Add a parent first" body="We need their address and health details before booking a visit." action={<Button title="Add a parent" size="md" onPress={() => router.replace('/parent/new')} style={{ marginTop: S.md, alignSelf: 'flex-start' }} />} />
      </Screen>
    );

  const ready = parentId && serviceId && date && slot;
  const tz = deviceTz();
  const abroad = !['Asia/Kolkata', 'Asia/Calcutta'].includes(tz);

  return (
    <Screen
      footer={
        <View>
          {ready && service && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: S.sm }}>
              <T v="small">{recurring ? `${count} visits × ${inr(perVisit)}` : service.name}</T>
              <T weight="bold">{inr(recurring ? perVisit * count : perVisit)}</T>
            </View>
          )}
          <Button title="Continue to payment" disabled={!ready} loading={create.isPending} onPress={() => create.mutate()} />
        </View>
      }
    >
      {bookable.length > 1 && (
        <Field label="Who is the visit for?">
          <View style={{ gap: S.sm }}>
            {bookable.map((p) => (
              <Pressable key={p._id} accessibilityRole="radio" accessibilityState={{ checked: parentId === p._id }} onPress={() => setParentId(p._id)} style={[styles.option, parentId === p._id && styles.optionOn]}>
                <T v="heading">{p.fullName}</T>
                <T v="small">{p.address?.line1}, {p.address?.city}</T>
              </Pressable>
            ))}
          </View>
        </Field>
      )}
      {bookable.length === 1 && parent && (
        <Card style={{ marginBottom: S.lg }}>
          <T v="small">Visit for</T>
          <T v="heading">{parent.fullName}</T>
          <T v="small">{parent.address?.line1}, {parent.address?.city} {parent.address?.pincode}</T>
        </Card>
      )}

      <Field label="Type of visit">
        <View style={{ gap: S.sm }}>
          {services.data?.map((s) => (
            <Pressable key={s._id} accessibilityRole="radio" accessibilityState={{ checked: serviceId === s._id }} onPress={() => setServiceId(s._id)} style={[styles.option, serviceId === s._id && styles.optionOn]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
                <T v="heading" style={{ flex: 1 }}>{s.name}</T>
                <T v="heading">{inr(s.basePrice)}</T>
              </View>
              {s.description ? <T v="small">{s.description}</T> : null}
              <T v="caption" style={{ marginTop: 4 }}>About {s.durationMinutes} minutes</T>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="Day (India time)">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
          {days.map((d) => {
            const full = !SLOTS.some((t) => slotOk(d, t));
            const [wd, dd, mm] = ymdLabel(d).split(' ');
            return (
              <Pressable key={d} disabled={full} onPress={() => setDate(d)} accessibilityRole="radio" accessibilityState={{ checked: date === d, disabled: full }} style={[styles.day, date === d && styles.dayOn, full && { opacity: 0.4 }]}>
                <T v="small" color={date === d ? '#fff' : C.muted}>{d === today ? 'Today' : wd.replace(',', '')}</T>
                <T v="title" color={date === d ? '#fff' : C.ink}>{dd}</T>
                <T v="small" color={date === d ? '#fff' : C.muted}>{mm}</T>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={{ marginTop: S.sm }}>
          <DateInput value={days.includes(date) ? undefined : date} onChange={setDate} placeholder="Another date…" minimumDate={new Date()} maximumDate={new Date(Date.now() + 119 * 86400000)} />
        </View>
      </Field>

      <Field label="Time (India time)" hint={abroad && slot && date ? `That's ${fmtTime(istToDate(date, slot), tz)} on ${dateLong(istToDate(date, slot), tz)} where you are.` : 'Visits run 7 am to 8 pm, at least 3 hours from now.'}>
        {daySlots.length === 0 ? (
          <T v="small">No times left on this day. Pick another day.</T>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
            {daySlots.map((t) => (
              <Chip key={t} label={hhmmLabel(t)} selected={slot === t} onPress={() => setSlot(t)} />
            ))}
          </View>
        )}
      </Field>

      <Card style={{ marginBottom: S.lg }}>
        <Toggle label="Repeat this visit" description={service?.recurringDiscountPercent ? `Save ${service.recurringDiscountPercent}% per visit with a prepaid plan` : 'Prepay a series of visits'} value={recurring} onChange={setRecurring} />
        {recurring && (
          <View style={{ marginTop: S.md, gap: S.md }}>
            <Choice columns={3} value={freq} onChange={setFreq} options={[{ value: 'WEEKLY', label: 'Weekly' }, { value: 'BIWEEKLY', label: 'Every 2 weeks' }, { value: 'MONTHLY', label: 'Monthly' }]} />
            <View style={{ flexDirection: 'row', gap: S.sm, flexWrap: 'wrap' }}>
              {[4, 8, 12, 26].map((n) => (
                <Chip key={n} label={`${n} visits`} selected={count === n} onPress={() => setCount(n)} />
              ))}
            </View>
            {preview.data && (
              <T v="small">
                {preview.data.dates.slice(0, 4).map((d) => dateLong(d)).join(', ')}
                {preview.data.dates.length > 4 ? ` … last on ${dateLong(preview.data.dates[preview.data.dates.length - 1])}` : ''}
              </T>
            )}
            <T v="caption">Each visit is confirmed and assigned separately. Cancel any time; unused visits are refunded.</T>
          </View>
        )}
      </Card>

      <Field label="Anything the care assistant should know?" hint="Optional. e.g. ring the bell twice, mother is hard of hearing.">
        <Input value={notes} onChangeText={setNotes} multiline maxLength={1000} />
      </Field>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { borderWidth: 1.5, borderColor: C.lineStrong, borderRadius: R.lg, padding: S.lg, backgroundColor: C.card },
  optionOn: { borderColor: C.brand, backgroundColor: C.brandSoft },
  day: { width: 68, paddingVertical: S.md, alignItems: 'center', borderRadius: R.md, borderWidth: 1.5, borderColor: C.lineStrong, backgroundColor: C.card },
  dayOn: { backgroundColor: C.brand, borderColor: C.brand },
});
