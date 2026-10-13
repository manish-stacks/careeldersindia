import type { ExpoConfig } from 'expo/config';

// Google Maps key is only needed for Android release/dev builds (Expo Go ships its own).
const googleMapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
// Universal / App Links host — must serve /.well-known/apple-app-site-association and assetlinks.json
const linkHost = process.env.EXPO_PUBLIC_APP_LINK_HOST || 'careeldersindia.com';
const tripReason = 'Care Elders India shares your location with the family and care desk only while you travel to a booked visit, including when the app is closed. Sharing stops when you arrive.';

const config: ExpoConfig = {
  name: 'Care Elders India',
  slug: 'careeldersindia',
  scheme: 'careeldersindia',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'in.careeldersindia.app',
    associatedDomains: [`applinks:${linkHost}`],
    infoPlist: {
      UIBackgroundModes: ['location', 'remote-notification'],
      NSLocationWhenInUseUsageDescription: tripReason,
      NSLocationAlwaysAndWhenInUseUsageDescription: tripReason,
      NSCameraUsageDescription: 'Take photos of prescriptions or documents during a visit.',
      NSPhotoLibraryUsageDescription: 'Attach photos of prescriptions, reports or your ID documents.',
    },
  },
  android: {
    package: 'in.careeldersindia.app',
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'CAMERA', 'POST_NOTIFICATIONS'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true, // Android App Links: needs assetlinks.json on the host
        data: [{ scheme: 'https', host: linkHost, pathPrefix: '/app' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    ...(googleMapsKey ? { config: { googleMaps: { apiKey: googleMapsKey } } } : {}),
    // FCM: drop google-services.json in the project root for push in development/production builds
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
  },
  plugins: [
    'expo-router',
    'expo-task-manager',
    'expo-secure-store',
    'expo-font',
    'expo-web-browser',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 240, backgroundColor: '#FFFFFF' }],
    [
      'expo-location',
      {
        locationWhenInUsePermission: tripReason,
        locationAlwaysAndWhenInUsePermission: tripReason,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['expo-image-picker', { photosPermission: 'Attach photos of prescriptions, reports or your ID documents.', cameraPermission: 'Take photos of prescriptions or documents during a visit.' }],
    ['expo-notifications', { color: '#0E5A8A', defaultChannel: 'default' }],
    ['@react-native-community/datetimepicker', {}],
  ],
  experiments: { typedRoutes: false },
};

export default config;
