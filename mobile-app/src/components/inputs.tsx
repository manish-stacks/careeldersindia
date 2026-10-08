import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R, S } from '@/lib/theme';
import { Chip, Input, T } from './ui';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const label = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

/** Date picker for dates of birth etc. Value is YYYY-MM-DD. */
export function DateInput({ value, onChange, placeholder = 'Choose a date', maximumDate, minimumDate }: { value?: string; onChange: (v: string) => void; placeholder?: string; maximumDate?: Date; minimumDate?: Date }) {
  const [open, setOpen] = useState(false);
  const onPick = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (e.type === 'set' && d) onChange(ymd(d));
  };
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={value ? label(value) : placeholder} onPress={() => setOpen((o) => !o)} style={styles.box}>
        <T color={value ? C.ink : C.faint} style={{ flex: 1, fontSize: 17 }}>
          {value ? label(value) : placeholder}
        </T>
        <Ionicons name="calendar-outline" size={20} color={C.muted} />
      </Pressable>
      {open && (
        <DateTimePicker
          value={value ? new Date(`${value}T00:00:00`) : maximumDate || new Date(1955, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={onPick}
        />
      )}
    </View>
  );
}

/** Time of day (HH:MM, 24h value) shown and picked as AM/PM. */
export function TimeInput({ value, onChange, placeholder = 'Choose a time' }: { value?: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const show = (v: string) => { const [h, m] = v.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
  const onPick = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (e.type === 'set' && d) onChange(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  };
  const base = new Date();
  if (value) base.setHours(Number(value.slice(0, 2)), Number(value.slice(3, 5)), 0, 0); else base.setHours(9, 0, 0, 0);
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={value ? show(value) : placeholder} onPress={() => setOpen((o) => !o)} style={styles.box}>
        <T color={value ? C.ink : C.faint} style={{ flex: 1, fontSize: 17 }}>{value ? show(value) : placeholder}</T>
        <Ionicons name="time-outline" size={20} color={C.muted} />
      </Pressable>
      {open && <DateTimePicker value={base} mode="time" is24Hour={false} display={Platform.OS === 'ios' ? 'spinner' : 'default'} minuteInterval={5} onChange={onPick} />}
    </View>
  );
}

/** Free-text list entry: type and add, tap to remove. */
export function TagInput({ values, onChange, placeholder, suggestions = [] }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [text, setText] = useState('');
  const add = (t: string) => {
    const v = t.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setText('');
  };
  const left = suggestions.filter((s) => !values.includes(s));
  return (
    <View>
      {values.length > 0 && (
        <View style={styles.tags}>
          {values.map((v) => (
            <Pressable key={v} accessibilityRole="button" accessibilityLabel={`Remove ${v}`} onPress={() => onChange(values.filter((x) => x !== v))} style={styles.tag}>
              <T weight="medium">{v}</T>
              <Ionicons name="close-circle" size={18} color={C.muted} />
            </Pressable>
          ))}
        </View>
      )}
      <Input value={text} onChangeText={setText} placeholder={placeholder} returnKeyType="done" onSubmitEditing={() => add(text)} blurOnSubmit={false} />
      {text.trim().length > 0 && (
        <Pressable onPress={() => add(text)} style={{ paddingVertical: 8 }}>
          <T color={C.brand} weight="semibold">+ Add &quot;{text.trim()}&quot;</T>
        </Pressable>
      )}
      {left.length > 0 && (
        <View style={[styles.tags, { marginTop: S.sm }]}>
          {left.slice(0, 8).map((s) => (
            <Chip key={s} label={`+ ${s}`} onPress={() => add(s)} />
          ))}
        </View>
      )}
    </View>
  );
}

export function NumberBox({ value, onChange, placeholder, unit, invalid, label }: { value: string; onChange: (v: string) => void; placeholder?: string; unit?: string; invalid?: boolean; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.num, invalid && { borderColor: C.danger }]}>
        <Input
          accessibilityLabel={label}
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          style={{ flex: 1, borderWidth: 0, fontSize: 24, fontFamily: F.semibold, minHeight: 56, backgroundColor: 'transparent' }}
        />
        {unit ? <T v="small" style={{ paddingRight: 12 }}>{unit}</T> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 52, borderWidth: 1.5, borderColor: C.lineStrong, borderRadius: R.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: C.card },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEF0F3', borderRadius: R.pill, paddingLeft: 12, paddingRight: 8, minHeight: 36 },
  num: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.lineStrong, borderRadius: R.md, backgroundColor: C.card },
});
