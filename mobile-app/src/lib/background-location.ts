/**
 * Background trip sharing — keeps running when the assistant switches apps, locks the phone,
 * or (Android) swipes ParentCare away from Recents, via a location foreground service.
 *
 * Runs outside React: this module MUST be imported from the app entry (index.js) so the OS can
 * wake the JS runtime and find the task even when no screen is mounted.
 *
 * It posts with a trip-scoped token (one booking, expires) — never the user session — so a
 * background refresh can't collide with refresh-token rotation in the foreground.
 */
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRIP_TASK = 'parentcare-trip-location';
const TRIP_KEY = 'pc:trip';
const QUEUE_KEY = 'pc:trip:queue';
const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.14:5000').replace(/\/$/, ''); // same default as lib/api.ts

export type Trip = { bookingId: string; token: string; expiresAt: string; patientName?: string };
type Fix = { latitude: number; longitude: number; accuracy?: number; heading?: number; speed?: number; timestamp: number };

export const readTrip = async (): Promise<Trip | null> => {
  const raw = await AsyncStorage.getItem(TRIP_KEY);
  return raw ? (JSON.parse(raw) as Trip) : null;
};
export const writeTrip = (t: Trip) => AsyncStorage.setItem(TRIP_KEY, JSON.stringify(t));
export const clearTrip = () => AsyncStorage.multiRemove([TRIP_KEY, QUEUE_KEY]);

async function stopTask() {
  if (await Location.hasStartedLocationUpdatesAsync(TRIP_TASK).catch(() => false)) await Location.stopLocationUpdatesAsync(TRIP_TASK).catch(() => {});
}

/** Sends fixes (plus anything queued while offline). Returns false when the trip is over. */
export async function sendFixes(fixes: Fix[]): Promise<boolean> {
  const trip = await readTrip();
  if (!trip) return false;
  if (new Date(trip.expiresAt).getTime() < Date.now()) return false;
  const queued: Fix[] = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) || '[]');
  // keep only recent fixes; the server ignores anything older than 15 min anyway
  const all = [...queued, ...fixes].filter((f) => Date.now() - f.timestamp < 14 * 60000).slice(-50);
  if (!all.length) return true;
  try {
    const r = await fetch(`${API_URL}/api/v1/trip/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trip-Token': trip.token },
      body: JSON.stringify({ locations: all }),
    });
    if (r.status === 410 || r.status === 401 || r.status === 403) return false; // trip ended / token invalid
    if (!r.ok) throw new Error(String(r.status));
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(all)); // offline: retry with the next fix
  }
  return true;
}

if (!TaskManager.isTaskDefined(TRIP_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRIP_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const fixes: Fix[] = data.locations.map((l) => ({
      latitude: l.coords.latitude,
      longitude: l.coords.longitude,
      accuracy: l.coords.accuracy ?? undefined,
      heading: l.coords.heading ?? undefined,
      speed: l.coords.speed ?? undefined,
      timestamp: l.timestamp,
    }));
    const active = await sendFixes(fixes);
    if (!active) {
      await clearTrip();
      await stopTask();
    }
  });
}

export async function startBackgroundUpdates(trip: Trip) {
  await writeTrip(trip);
  await stopTask();
  await Location.startLocationUpdatesAsync(TRIP_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000, // Android
    distanceInterval: 25,
    deferredUpdatesInterval: 15000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true, // iOS blue pill — honest to the assistant
    activityType: Location.ActivityType.AutomotiveNavigation,
    foregroundService: {
      notificationTitle: 'Sharing your location with the family',
      notificationBody: trip.patientName ? `On the way to ${trip.patientName}. Stops when you tap "I've arrived".` : 'Stops when you tap "I\'ve arrived".',
      notificationColor: '#C8352E',
      killServiceOnDestroy: false, // keep sharing after the app is swiped away from Recents (Android)
    },
  });
}

export async function stopBackgroundUpdates() {
  await stopTask();
  await clearTrip();
}

export const backgroundRunning = () => Location.hasStartedLocationUpdatesAsync(TRIP_TASK).catch(() => false);
