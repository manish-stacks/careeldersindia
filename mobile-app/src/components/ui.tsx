import { forwardRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R, S, TONES, type Tone } from '@/lib/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

// ---------------------------------------------------------------- text
type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'small' | 'caption';
const V: Record<Variant, TextStyle> = {
  display: { fontFamily: F.bold, fontSize: 28, lineHeight: 34, color: C.ink, letterSpacing: -0.3 },
  title: { fontFamily: F.bold, fontSize: 22, lineHeight: 28, color: C.ink },
  heading: { fontFamily: F.semibold, fontSize: 18, lineHeight: 24, color: C.ink },
  body: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.ink },
  label: { fontFamily: F.semibold, fontSize: 15, lineHeight: 20, color: C.inkSoft },
  small: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
  caption: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
};
export function T({ v = 'body', style, color, weight, children, ...p }: TextProps & { v?: Variant; color?: string; weight?: keyof typeof F }) {
  return (
    <Text maxFontSizeMultiplier={1.6} style={[V[v], color ? { color } : null, weight ? { fontFamily: F[weight] } : null, style]} {...p}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------- screen
export function Screen({
  children, scroll = true, refreshing, onRefresh, padded = true, footer, style, tabbed,
}: {
  children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; padded?: boolean; footer?: ReactNode; style?: StyleProp<ViewStyle>; tabbed?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded ? { padding: S.lg, paddingBottom: S.xxl + (footer || tabbed ? 0 : insets.bottom) } : { paddingBottom: S.xxl + (footer || tabbed ? 0 : insets.bottom) }, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && { padding: S.lg }, style]}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {body}
        {footer && <View style={[styles.footer, { paddingBottom: tabbed ? S.md : Math.max(insets.bottom, S.md) }]}>{footer}</View>}
      </KeyboardAvoidingView>
    </View>
  );
}

// ---------------------------------------------------------------- button
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSolid';
export function Button({
  title, onPress, variant = 'primary', loading, disabled, icon, style, size = 'lg', accessibilityLabel,
}: { title: string; onPress?: () => void; variant?: BtnVariant; loading?: boolean; disabled?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>; size?: 'md' | 'lg'; accessibilityLabel?: string }) {
  const off = disabled || loading;
  const pal = {
    primary: { bg: C.brand, fg: '#fff', border: C.brand },
    secondary: { bg: C.card, fg: C.ink, border: C.lineStrong },
    ghost: { bg: 'transparent', fg: C.brand, border: 'transparent' },
    danger: { bg: C.card, fg: C.danger, border: '#E8B4AE' },
    dangerSolid: { bg: C.danger, fg: '#fff', border: C.danger },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.btn,
        { minHeight: size === 'lg' ? 54 : 44, backgroundColor: pal.bg, borderColor: pal.border, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={pal.fg} /> : icon ? <Ionicons name={icon} size={20} color={pal.fg} /> : null}
      <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: F.semibold, fontSize: size === 'lg' ? 17 : 15, color: pal.fg }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color = C.ink, bg }: { icon: IconName; onPress: () => void; label: string; color?: string; bg?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.iconBtn, { backgroundColor: bg || 'transparent', opacity: pressed ? 0.7 : 1 }]}>
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

// ---------------------------------------------------------------- surfaces
export function Card({ children, style, onPress, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: Tone }) {
  const bg = tone ? TONES[tone].bg : C.card;
  const border = tone ? 'transparent' : C.line;
  if (onPress)
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: bg, borderColor: border, opacity: pressed ? 0.9 : 1 }, style]}>
        {children}
      </Pressable>
    );
  return <View style={[styles.card, { backgroundColor: bg, borderColor: border }, style]}>{children}</View>;
}

export function Section({ title, action, children, style }: { title?: string; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: S.xl }, style]}>
      {(title || action) && (
        <View style={styles.sectionHead}>
          {title ? <T v="heading">{title}</T> : <View />}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function Row({ icon, title, subtitle, right, onPress, danger, last }: { icon?: IconName; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; danger?: boolean; last?: boolean }) {
  const inner = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }]}>
      {icon && <Ionicons name={icon} size={22} color={danger ? C.danger : C.inkSoft} style={{ marginRight: S.md }} />}
      <View style={{ flex: 1 }}>
        <T weight="medium" color={danger ? C.danger : C.ink}>
          {title}
        </T>
        {subtitle ? <T v="small">{subtitle}</T> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={C.faint} /> : null)}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {inner}
    </Pressable>
  ) : (
    inner
  );
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: TONES[tone].bg }]}>
      {icon ? <Ionicons name={icon} size={13} color={TONES[tone].fg} /> : <View style={[styles.dot, { backgroundColor: TONES[tone].fg }]} />}
      <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: F.semibold, fontSize: 13, color: TONES[tone].fg }}>
        {label}
      </Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected ? { backgroundColor: C.ink, borderColor: C.ink } : null, { opacity: pressed ? 0.8 : 1 }]}
    >
      {icon && <Ionicons name={icon} size={16} color={selected ? '#fff' : C.inkSoft} />}
      <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: F.medium, fontSize: 15, color: selected ? '#fff' : C.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented<V extends string>({ value, onChange, items }: { value: V; onChange: (v: V) => void; items: { value: V; label: string; count?: number }[] }) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable key={it.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(it.value)} style={[styles.segItem, on && styles.segOn]}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: on ? F.semibold : F.medium, fontSize: 15, color: on ? C.ink : C.muted }}>
              {it.label}
              {it.count ? ` (${it.count})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- form
export function Field({ label, hint, error, children, style, required }: { label: string; hint?: string; error?: string; children: ReactNode; style?: StyleProp<ViewStyle>; required?: boolean }) {
  return (
    <View style={[{ marginBottom: S.lg }, style]}>
      <T v="label" style={{ marginBottom: 6 }}>
        {label}
        {required ? <T v="label" color={C.brand}> *</T> : null}
      </T>
      {children}
      {error ? (
        <T v="small" color={C.danger} style={{ marginTop: 4 }}>
          {error}
        </T>
      ) : hint ? (
        <T v="small" style={{ marginTop: 4 }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export const Input = forwardRef<TextInput, TextInputProps & { invalid?: boolean }>(({ style, invalid, multiline, ...p }, ref) => {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={C.faint}
      maxFontSizeMultiplier={1.5}
      multiline={multiline}
      onFocus={(e) => {
        setFocus(true);
        p.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        p.onBlur?.(e);
      }}
      style={[styles.input, multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }, focus && { borderColor: C.brand }, invalid && { borderColor: C.danger }, style]}
      {...p}
    />
  );
});
Input.displayName = 'Input';

export function Toggle({ label, value, onChange, description }: { label: string; value: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <T weight="medium">{label}</T>
        {description ? <T v="small">{description}</T> : null}
      </View>
      <View style={[styles.switch, value && { backgroundColor: C.brand }]}>
        <View style={[styles.knob, value && { transform: [{ translateX: 20 }] }]} />
      </View>
    </Pressable>
  );
}

export function Choice<V extends string>({ value, onChange, options, columns = 2 }: { value?: V; onChange: (v: V) => void; options: { value: V; label: string; tone?: Tone; icon?: IconName }[]; columns?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
      {options.map((o) => {
        const on = value === o.value;
        const t = o.tone ? TONES[o.tone] : { bg: C.ink, fg: '#fff' };
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[styles.choice, { width: `${100 / columns - 2}%` as `${number}%` }, on && { backgroundColor: o.tone ? t.bg : C.ink, borderColor: o.tone ? t.fg : C.ink }]}
          >
            {o.icon && <Ionicons name={o.icon} size={20} color={on ? (o.tone ? t.fg : '#fff') : C.inkSoft} />}
            <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: F.semibold, fontSize: 15, textAlign: 'center', color: on ? (o.tone ? t.fg : '#fff') : C.ink }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- states
export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={C.brand} />
      {label ? <T v="small" style={{ marginTop: S.md }}>{label}</T> : null}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={C.faint} />
      <T v="heading" style={{ marginTop: S.md, textAlign: 'center' }}>
        Couldn&apos;t load this
      </T>
      <T v="small" style={{ textAlign: 'center', marginTop: 4 }}>
        {error instanceof Error ? error.message : 'Something went wrong'}
      </T>
      {onRetry && <Button title="Try again" variant="secondary" size="md" onPress={onRetry} style={{ marginTop: S.lg, alignSelf: 'center', paddingHorizontal: S.xl }} />}
    </View>
  );
}

export function Empty({ icon = 'leaf-outline', title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: S.xxl, paddingHorizontal: S.lg }}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={C.faint} />
      </View>
      <T v="heading" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {body ? <T v="small" style={{ textAlign: 'center', marginTop: 4, maxWidth: 300 }}>{body}</T> : null}
      {action ? <View style={{ marginTop: S.lg, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function Notice({ tone = 'info', title, body, icon, action }: { tone?: Tone; title: string; body?: string; icon?: IconName; action?: ReactNode }) {
  return (
    <View style={[styles.notice, { backgroundColor: TONES[tone].bg }]}>
      <Ionicons name={icon || (tone === 'danger' ? 'alert-circle' : tone === 'warn' ? 'warning' : 'information-circle')} size={22} color={TONES[tone].fg} />
      <View style={{ flex: 1 }}>
        <T weight="semibold" color={TONES[tone].fg}>
          {title}
        </T>
        {body ? <T v="small" color={C.inkSoft}>{body}</T> : null}
        {action}
      </View>
    </View>
  );
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, S.lg) }]}>
          <View style={styles.sheetHead}>
            <T v="title" style={{ flex: 1 }}>
              {title}
            </T>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: S.md }}>
            {children}
          </ScrollView>
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const Divider = () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: S.md }} />;
export const Gap = ({ h = S.md }: { h?: number }) => <View style={{ height: h }} />;

export function KV({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.lg, paddingVertical: 6 }}>
      <T v="small">{label}</T>
      {typeof value === 'string' || typeof value === 'number' || value === undefined ? (
        <T weight="medium" style={{ flexShrink: 1, textAlign: 'right' }}>
          {value ?? '—'}
        </T>
      ) : (
        value
      )}
    </View>
  );
}

export function Pill({ children, onPress, icon, selected }: PressableProps & { children: string; icon?: IconName; selected?: boolean }) {
  return <Chip label={children} icon={icon} onPress={onPress as () => void} selected={selected} />;
}

const styles = StyleSheet.create({
  footer: { paddingHorizontal: S.lg, paddingTop: S.md, backgroundColor: C.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm, borderRadius: R.md, borderWidth: 1.5, paddingHorizontal: S.lg },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: R.lg, borderWidth: 1, padding: S.lg },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, minHeight: 56 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: C.lineStrong, borderRadius: R.pill, paddingHorizontal: 14, minHeight: 40, backgroundColor: C.card },
  seg: { flexDirection: 'row', backgroundColor: '#EEF0F3', borderRadius: R.md, padding: 4 },
  segItem: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  segOn: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  input: { minHeight: 52, borderWidth: 1.5, borderColor: C.lineStrong, borderRadius: R.md, paddingHorizontal: 14, fontFamily: F.regular, fontSize: 17, color: C.ink, backgroundColor: C.card },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.md, minHeight: 56 },
  switch: { width: 50, height: 30, borderRadius: 15, backgroundColor: C.lineStrong, padding: 3 },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  choice: { minHeight: 56, borderWidth: 1.5, borderColor: C.lineStrong, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', padding: S.sm, gap: 4, backgroundColor: C.card },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EEF0F3', alignItems: 'center', justifyContent: 'center', marginBottom: S.md },
  notice: { flexDirection: 'row', gap: S.md, padding: S.lg, borderRadius: R.lg, alignItems: 'flex-start' },
  scrim: { flex: 1, backgroundColor: 'rgba(31,35,40,0.45)' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: S.lg, paddingTop: S.sm },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: S.sm },
});
