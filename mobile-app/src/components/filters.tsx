import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, S } from '@/lib/theme';
import { Chip, Input } from '@/components/ui';

export type DateKey = 'any' | 'today' | 'tomorrow' | 'next7' | 'last7' | 'last30' | 'last90';
export const UPCOMING_DATES: { key: DateKey; label: string }[] = [
  { key: 'any', label: 'All dates' }, { key: 'today', label: 'Today' }, { key: 'tomorrow', label: 'Tomorrow' }, { key: 'next7', label: 'Next 7 days' },
];
export const PAST_DATES: { key: DateKey; label: string }[] = [
  { key: 'any', label: 'All dates' }, { key: 'last7', label: 'Last 7 days' }, { key: 'last30', label: 'Last 30 days' }, { key: 'last90', label: 'Last 90 days' },
];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

/** Date chip -> { from, to } query params (YYYY-MM-DD). */
export function dateRange(k: DateKey): { from?: string; to?: string } {
  switch (k) {
    case 'today': return { from: addDays(0), to: addDays(0) };
    case 'tomorrow': return { from: addDays(1), to: addDays(1) };
    case 'next7': return { from: addDays(0), to: addDays(7) };
    case 'last7': return { from: addDays(-7), to: addDays(0) };
    case 'last30': return { from: addDays(-30), to: addDays(0) };
    case 'last90': return { from: addDays(-90), to: addDays(0) };
    default: return {};
  }
}

/** Value that only updates after the user stops typing, so we don't hit the API on every key press. */
export function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function FilterBar({ search, onSearch, placeholder, dates, date, onDate }: {
  search: string; onSearch: (v: string) => void; placeholder: string;
  dates: { key: DateKey; label: string }[]; date: DateKey; onDate: (k: DateKey) => void;
}) {
  return (
    <View style={{ gap: S.sm }}>
      <View>
        <Input value={search} onChangeText={onSearch} placeholder={placeholder} autoCorrect={false} returnKeyType="search" style={{ paddingLeft: 42 }} />
        <Ionicons name="search" size={20} color={C.muted} style={{ position: 'absolute', left: 14, top: 15 }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: S.sm }}>
        {dates.map((d) => <Chip key={d.key} label={d.label} selected={date === d.key} onPress={() => onDate(d.key)} />)}
      </ScrollView>
    </View>
  );
}

/** Shared FlatList tuning: render small windows, load the next page early, recycle off-screen rows. */
export const LIST_PERF = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  windowSize: 7,
  removeClippedSubviews: true,
  onEndReachedThreshold: 0.6,
  keyboardShouldPersistTaps: 'handled' as const,
};
