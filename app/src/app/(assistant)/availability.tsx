import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { hhmmLabel } from '@/lib/format';
import { C, R, S } from '@/lib/theme';
import type { AssistantProfile } from '@/lib/types';
import { Button, Card, ErrorView, Loading, Screen, T, Toggle } from '@/components/ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Day = { on: boolean; start: string; end: string };

function TimeBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(':').map(Number);
  return (
    <View style={{ flex: 1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${hhmmLabel(value)}`} onPress={() => setOpen((o) => !o)} style={{ borderWidth: 1.5, borderColor: C.lineStrong, borderRadius: R.md, minHeight: 48, justifyContent: 'center', paddingHorizontal: S.md }}>
        <T v="caption">{label}</T>
        <T weight="semibold">{hhmmLabel(value)}</T>
      </Pressable>
      {open && (
        <DateTimePicker
          mode="time"
          value={new Date(2020, 0, 1, h, m)}
          minuteInterval={15}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => {
            if (Platform.OS === 'android') setOpen(false);
            if (e.type === 'set' && d) onChange(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
          }}
        />
      )}
    </View>
  );
}

export default function Availability() {
  const q = useQuery({ queryKey: ['assistant-profile'], queryFn: () => api.get<{ profile: AssistantProfile }>('/assistant/profile') });
  const [available, setAvailable] = useState(true);
  const [days, setDays] = useState<Day[]>(DAYS.map(() => ({ on: false, start: '08:00', end: '19:00' })));
  useEffect(() => {
    const p = q.data?.profile;
    if (!p) return;
    setAvailable(p.isAvailable);
    setDays(DAYS.map((_, i) => {
      const w = p.workingHours.find((x) => x.day === i);
      return w ? { on: true, start: w.start, end: w.end } : { on: false, start: '08:00', end: '19:00' };
    }));
  }, [q.data]);

  const bad = days.some((d) => d.on && d.start >= d.end);
  const save = useAction(
    () => api.put('/assistant/availability', { isAvailable: available, workingHours: days.map((d, i) => ({ day: i, ...d })).filter((d) => d.on).map(({ day, start, end }) => ({ day, start, end })) }),
    { success: 'Availability saved', invalidate: [['assistant-profile'], ['home']], onDone: () => router.back() }
  );

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  return (
    <Screen footer={<Button title="Save" loading={save.isPending} disabled={bad} onPress={() => save.mutate()} />}>
      <Card>
        <Toggle label="Taking new visits" description="Turn off when on leave. Visits already accepted stay with you." value={available} onChange={setAvailable} />
      </Card>
      <T v="heading" style={{ marginTop: S.xl, marginBottom: S.sm }}>Working hours (India time)</T>
      <View style={{ gap: S.sm }}>
        {days.map((d, i) => (
          <Card key={DAYS[i]}>
            <Toggle label={DAYS[i]} value={d.on} onChange={(on) => setDays(days.map((x, j) => (j === i ? { ...x, on } : x)))} />
            {d.on && (
              <View style={{ flexDirection: 'row', gap: S.sm }}>
                <TimeBox label="From" value={d.start} onChange={(v) => setDays(days.map((x, j) => (j === i ? { ...x, start: v } : x)))} />
                <TimeBox label="To" value={d.end} onChange={(v) => setDays(days.map((x, j) => (j === i ? { ...x, end: v } : x)))} />
              </View>
            )}
            {d.on && d.start >= d.end && <T v="small" color={C.danger}>End time must be after start time</T>}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
