import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

let registeredToken: string | null = null;

// Expo Go can't receive remote push (Android throws since SDK 55) — push needs a development build.
export const pushSupported = () => Device.isDevice && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

export async function setupChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', { name: 'Visit updates', importance: Notifications.AndroidImportance.HIGH, lightColor: '#0E5A8A' });
  await Notifications.setNotificationChannelAsync('urgent', { name: 'Urgent alerts', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 400, 200, 400], lightColor: '#0E5A8A' });
}

/** Registers the native FCM/APNs token with our server (the backend sends through Firebase Admin). */
export async function registerPush() {
  if (!pushSupported()) return null;
  await setupChannels();
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return null;
  const token = (await Notifications.getDevicePushTokenAsync()).data as string;
  if (!token || token === registeredToken) return token;
  await api.post('/notifications/register-token', {
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    deviceId: Constants.sessionId,
    appVersion: Constants.expoConfig?.version,
  });
  registeredToken = token;
  return token;
}

export async function unregisterPush() {
  if (!registeredToken) return;
  await api.post('/notifications/unregister-token', { token: registeredToken }).catch(() => {});
  registeredToken = null;
}
