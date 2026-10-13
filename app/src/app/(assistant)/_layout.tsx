import { useEffect } from 'react';
import { Redirect, Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import * as Location from 'expo-location';
import { rememberPending } from '@/lib/links';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { restoreTracking, startTracking, stopTracking, trackingBooking } from '@/lib/tracker';
import type { Job } from '@/lib/types';
import { C, F } from '@/lib/theme';

/**
 * On every launch: re-attach to a background trip the OS kept alive, start one for a job that is
 * ON_THE_WAY (only if permission was already granted — never prompt on launch), stop stale ones.
 */
function useResumeTrip(enabled: boolean) {
  const q = useQuery({ queryKey: ['jobs', 'resume-trip'], queryFn: () => api.page<Job>('/assistant/jobs?scope=upcoming&limit=50'), enabled });
  useEffect(() => {
    if (!q.data) return;
    (async () => {
      await restoreTracking();
      const onTheWay = q.data.items.find((j) => j.status === 'ON_THE_WAY');
      if (onTheWay && trackingBooking() !== onTheWay._id && (await Location.getForegroundPermissionsAsync()).granted) await startTracking(onTheWay._id, onTheWay.patient.name);
      if (!onTheWay && trackingBooking()) await stopTracking();
    })().catch(() => {});
  }, [q.data]);
}

export default function AssistantLayout() {
  const { user } = useAuth();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  useResumeTrip(user?.role === 'ASSISTANT');
  if (!user) {
    rememberPending(pathname + qsOf(params));
    return <Redirect href="/login" />;
  }
  if (user.role !== 'ASSISTANT') return <Redirect href="/" />;
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
      <Stack.Screen name="job/[id]" options={{ title: 'Visit' }} />
      <Stack.Screen name="visit/[id]" options={{ title: 'Record visit', gestureEnabled: false }} />
      <Stack.Screen name="documents" options={{ title: 'Documents' }} />
      <Stack.Screen name="availability" options={{ title: 'Availability' }} />
      <Stack.Screen name="profile-edit" options={{ title: 'Edit profile' }} />
    </Stack>
  );
}

function qsOf(p: Record<string, string | string[] | undefined>) {
  const e = Object.entries(p).filter(([k, v]) => v !== undefined && k !== 'id');
  return e.length ? '?' + e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : '';
}
