import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { C, F } from '@/lib/theme';

export default function AuthLayout() {
  const { user } = useAuth();
  if (user) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: C.ink,
        headerTitleStyle: { fontFamily: F.semibold },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: C.canvas },
        contentStyle: { backgroundColor: C.canvas },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'Create account' }} />
      <Stack.Screen name="register-assistant" options={{ title: 'Join as a care assistant' }} />
      <Stack.Screen name="forgot" options={{ title: 'Reset password' }} />
    </Stack>
  );
}
