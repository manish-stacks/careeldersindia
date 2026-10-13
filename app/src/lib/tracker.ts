import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { api } from './api';
import { backgroundRunning, readTrip, sendFixes, startBackgroundUpdates, stopBackgroundUpdates, writeTrip } from './background-location';

/**
 * Trip sharing for assistants.
 *  mode "background": OS task + Android foreground service → works with the app closed / swiped away (Android)
 *                     and while backgrounded or locked (iOS; iOS stops if the user force-quits — server nudges them).
 *  mode "foreground": fallback when "Allow all the time" isn't granted (or in Expo Go): shares while the app is open.
 */
export type Mode = 'background' | 'foreground' | null;

let watch: Location.LocationSubscription | null = null;
let active: { bookingId: string; mode: Mode } | null = null;
const listeners = new Set<(s: typeof active) => void>();
const emit = () => listeners.forEach((l) => l(active));

export const trackingBooking = () => active?.bookingId ?? null;
export const trackingMode = (): Mode => active?.mode ?? null;
export const onTrackingChange = (fn: (s: { bookingId: string; mode: Mode } | null) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export async function ensureLocationPermission() {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

/** "Allow all the time" — on Android 11+ this opens the settings page. */
export async function ensureBackgroundPermission() {
  if (!(await ensureLocationPermission())) return false;
  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.granted) return true;
  if (!bg.canAskAgain) return false;
  return (await Location.requestBackgroundPermissionsAsync()).granted;
}

export const backgroundPermissionGranted = async () => (await Location.getBackgroundPermissionsAsync()).granted;
export const openAppSettings = () => Linking.openSettings();

async function tripToken(bookingId: string, patientName?: string) {
  const existing = await readTrip();
  if (existing?.bookingId === bookingId && new Date(existing.expiresAt).getTime() - Date.now() > 30 * 60000) return existing;
  const t = await api.post<{ token: string; expiresAt: string }>(`/assistant/jobs/${bookingId}/trip-token`);
  const trip = { bookingId, token: t.token, expiresAt: t.expiresAt, patientName };
  await writeTrip(trip);
  return trip;
}

async function startForegroundWatch(bookingId: string) {
  watch?.remove();
  activateKeepAwakeAsync('trip').catch(() => {});
  watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 25 }, (l) => {
    sendFixes([{ latitude: l.coords.latitude, longitude: l.coords.longitude, accuracy: l.coords.accuracy ?? undefined, speed: l.coords.speed ?? undefined, heading: l.coords.heading ?? undefined, timestamp: l.timestamp }]).then((ok) => {
      if (!ok && active?.bookingId === bookingId) stopTracking();
    });
  });
}

/** Returns the mode actually running, or null if location permission was refused. */
export async function startTracking(bookingId: string, patientName?: string): Promise<Mode> {
  if (active?.bookingId === bookingId && (active.mode === 'foreground' ? !!watch : await backgroundRunning())) return active.mode;
  if (!(await ensureLocationPermission())) return null;
  const trip = await tripToken(bookingId, patientName);
  const bg = await ensureBackgroundPermission();
  let mode: Mode = 'foreground';
  if (bg) {
    try {
      await startBackgroundUpdates(trip);
      mode = 'background';
    } catch {
      mode = 'foreground'; // e.g. Expo Go on iOS — no background location there
    }
  }
  if (mode === 'foreground') await startForegroundWatch(bookingId);
  const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  if (first) await sendFixes([{ latitude: first.coords.latitude, longitude: first.coords.longitude, accuracy: first.coords.accuracy ?? undefined, timestamp: first.timestamp }]);
  active = { bookingId, mode };
  emit();
  return mode;
}

export async function stopTracking() {
  watch?.remove();
  watch = null;
  deactivateKeepAwake('trip');
  await stopBackgroundUpdates();
  active = null;
  emit();
}

/** After a cold start: is the OS task still running for a trip? (Android keeps it alive after swipe-away.) */
export async function restoreTracking() {
  const trip = await readTrip();
  if (trip && (await backgroundRunning())) {
    active = { bookingId: trip.bookingId, mode: 'background' };
    emit();
  }
  return active;
}

export async function currentCoords() {
  if (!(await ensureLocationPermission())) return null;
  const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
  return l ? { latitude: l.coords.latitude, longitude: l.coords.longitude } : null;
}

export const isAndroid = Platform.OS === 'android';
