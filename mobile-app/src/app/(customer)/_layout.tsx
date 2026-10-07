import { Redirect, Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { rememberPending } from '@/lib/links';
import { useAuth } from '@/lib/auth';
import { C, F } from '@/lib/theme';

export default function CustomerLayout() {
  const { user } = useAuth();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  if (!user) {
    const e = Object.entries(params).filter(([k, v]) => v !== undefined && k !== 'id');
    rememberPending(pathname + (e.length ? '?' + e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : ''));
    return <Redirect href="/login" />;
  }
  if (user.role !== 'CUSTOMER') return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: C.ink,
        headerTitleStyle: { fontFamily: F.semibold, fontSize: 18 },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: C.canvas },
        contentStyle: { backgroundColor: C.canvas },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="book" options={{ title: 'Book a visit' }} />
      <Stack.Screen name="pay" options={{ title: 'Payment', gestureEnabled: false }} />
      <Stack.Screen name="booking/[id]" options={{ title: 'Visit' }} />
      <Stack.Screen name="parent/new" options={{ title: 'Add a parent' }} />
      <Stack.Screen name="parent/[id]/index" options={{ title: '' }} />
      <Stack.Screen name="parent/[id]/edit" options={{ title: 'Edit details' }} />
      <Stack.Screen name="parent/[id]/family" options={{ title: 'Family access' }} />
      <Stack.Screen name="report/[id]" options={{ title: 'Visit report' }} />
      <Stack.Screen name="plans" options={{ title: 'Recurring plans' }} />
      <Stack.Screen name="plan/[id]" options={{ title: 'Plan' }} />
      <Stack.Screen name="payments" options={{ title: 'Payments' }} />
      <Stack.Screen name="profile" options={{ title: 'Your details' }} />
    </Stack>
  );
}
