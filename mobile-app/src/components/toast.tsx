import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R, S } from '@/lib/theme';

type Kind = 'success' | 'error' | 'info';
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; kind: Kind } | null>(null);
  const op = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback(
    (text: string, kind: Kind = 'success') => {
      setMsg({ text, kind });
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => Animated.timing(op, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMsg(null)), kind === 'error' ? 5000 : 3000);
    },
    [op]
  );
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg && (
        <Animated.View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8, opacity: op }]} accessibilityLiveRegion="polite">
          <View style={[styles.toast, { borderLeftColor: msg.kind === 'error' ? C.danger : msg.kind === 'success' ? C.ok : C.info }]}>
            <Ionicons name={msg.kind === 'error' ? 'alert-circle' : msg.kind === 'success' ? 'checkmark-circle' : 'information-circle'} size={22} color={msg.kind === 'error' ? C.danger : msg.kind === 'success' ? C.ok : C.info} />
            <Text style={styles.text}>{msg.text}</Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: S.lg, right: S.lg, zIndex: 100 },
  toast: { flexDirection: 'row', gap: S.sm, alignItems: 'center', backgroundColor: C.card, borderRadius: R.md, padding: S.md, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  text: { flex: 1, fontFamily: F.medium, fontSize: 15, color: C.ink },
});
