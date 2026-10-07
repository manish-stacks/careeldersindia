import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useFonts, Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SocketProvider } from '@/lib/socket';
import { ToastProvider } from '@/components/toast';
import { registerPush } from '@/lib/push';
import { notificationTarget, openExternal, rememberPending } from '@/lib/links';
import { ApiError } from '@/lib/api';
import { C, F } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2 },
  },
});

function Gate() {
  const { user, ready } = useAuth();
  const [fontsLoaded] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold });
  const [tapped, setTapped] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (ready && fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [ready, fontsLoaded]);

  useEffect(() => {
    if (user) registerPush().catch(() => {});
  }, [user]);

  // Notification taps: cold start (app was closed / swiped away) + while running
  useEffect(() => {
    let handled: string | null = null;
    const take = (r: Notifications.NotificationResponse | null) => {
      if (!r || r.notification.request.identifier === handled) return;
      handled = r.notification.request.identifier;
      setTapped((r.notification.request.content.data || {}) as Record<string, unknown>);
    };
    Notifications.getLastNotificationResponseAsync().then(take).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(take);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!tapped || !ready) return;
    const target = notificationTarget(tapped, user?.role);
    setTapped(null);
    if (!target) return;
    if ('external' in target) return void openExternal(target.external);
    if (!user) return rememberPending(target.href); // opens right after sign-in
    router.push(target.href as never);
  }, [tapped, ready, user]);

  if (!ready || !fontsLoaded) return null;

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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(customer)" options={{ headerShown: false }} />
      <Stack.Screen name="(assistant)" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
      <Stack.Screen name="sos" options={{ title: 'Emergency help', presentation: 'modal' }} />
      <Stack.Screen name="open" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AuthProvider>
            <SocketProvider>
              <StatusBar style="dark" />
              <Gate />
            </SocketProvider>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
