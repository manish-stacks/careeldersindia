import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { C, S } from '@/lib/theme';
import { Button, Field, Input, Notice, Screen, T } from '@/components/ui';

export default function Login() {
  const { signIn } = useAuth();
  const { data: contact } = useQuery({ queryKey: ['contact'], queryFn: () => api.get<{ email?: string; phone?: string }>('/contact'), staleTime: 5 * 60_000 });
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await signIn(identifier.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <StatusBar style="light" />
      <View style={[styles.hero, { paddingTop: insets.top + S.xl }]}>
        <View style={styles.mark}>
          <Image source={require('../../../assets/logo.png')} style={{ width: 130, height: 80 }} resizeMode="contain" accessibilityLabel="Care Elders India" />
        </View>
        <T color="#DCEBF5" style={{ marginTop: 4, fontSize: 17 }}>
          Trusted daily home care for your family, monitored from anywhere.
        </T>
      </View>
      <View style={{ padding: S.lg }}>
        <Field label="Email or mobile number">
          <Input value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="username" placeholder="you@example.com" />
        </Field>
        <Field label="Password">
          <View>
            <Input value={password} onChangeText={setPassword} secureTextEntry={!show} textContentType="password" autoComplete="password" onSubmitEditing={submit} returnKeyType="go" style={{ paddingRight: 52 }} placeholder="••••••••" />
            <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} onPress={() => setShow((s) => !s)} style={styles.eye} hitSlop={8}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={C.muted} />
            </Pressable>
          </View>
        </Field>
        {error && <Notice tone="danger" title={error} />}
        <Button title="Sign in" onPress={submit} loading={busy} disabled={!identifier || !password} style={{ marginTop: S.lg }} />
        <Link href="/forgot" asChild>
          <Pressable style={{ alignSelf: 'center', padding: S.md }}>
            <T color={C.brand} weight="semibold">Forgot password?</T>
          </Pressable>
        </Link>

        <View style={styles.divider} />
        <T v="small" style={{ textAlign: 'center' }}>Accounts are created by the Care Elders India care desk. Contact support if you need access or cannot sign in.</T>
        {contact?.email ? (
          <Pressable onPress={() => Linking.openURL(`mailto:${contact.email}`)} style={{ alignItems: 'center', marginTop: S.sm }}>
            <T v="small" color={C.brand} weight="semibold">{contact.email}{contact.phone ? ` · ${contact.phone}` : ''}</T>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: C.brand, paddingHorizontal: S.lg, paddingBottom: S.xxl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  mark: { alignSelf: 'flex-start', borderRadius: 18, backgroundColor: '#fff', padding: 10 },
  eye: { position: 'absolute', right: 12, top: 14 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: S.xl },
});
