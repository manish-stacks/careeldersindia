import type { ExpoConfig } from 'expo/config';

// Google Maps key is only needed for Android release/dev builds (Expo Go ships its own).
const googleMapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
// Universal / App Links host — must serve /.well-known/apple-app-site-association and assetlinks.json
const linkHost = process.env.EXPO_PUBLIC_APP_LINK_HOST || 'careeldersindia.com';
const tripReason =
  'Care Elders India collects location data during care assistant visits to verify travel and arrival at the elderly parent’s home, and to provide real-time updates to families, even when the app is closed or not in use.';

let hasGoogleServicesAndroid = false;
let hasGoogleServicesIos = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsMod = eval("require('fs')");
  hasGoogleServicesAndroid = fsMod.existsSync('./google-services.json');
  hasGoogleServicesIos = fsMod.existsSync('./GoogleService-Info.plist');
} catch {}

const googleServicesAndroid = process.env.GOOGLE_SERVICES_JSON || (hasGoogleServicesAndroid ? './google-services.json' : undefined);
const googleServicesIos = process.env.GOOGLE_SERVICES_IOS || (hasGoogleServicesIos ? './GoogleService-Info.plist' : undefined);

const config: ExpoConfig = {
  name: 'Care Elders India',
  slug: 'careeldersindia',
  scheme: 'careeldersindia',
  extra: {
    eas: {
      projectId: '68bbba5e-94a9-4fc9-8142-ab09653973d9',
    },
  },
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
      NSLocationAlwaysUsageDescription: tripReason,
      NSCameraUsageDescription: 'Take photos of prescriptions or medical documents during a visit.',
      NSPhotoLibraryUsageDescription: 'Attach photos of prescriptions, medical reports or ID documents.',
    },
    ...(googleServicesIos ? { googleServicesFile: googleServicesIos } : {}),
  },
  android: {
    package: 'in.careeldersindia.app',
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'CAMERA',
      'POST_NOTIFICATIONS',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true, // Android App Links: needs assetlinks.json on the host
        data: [{ scheme: 'https', host: linkHost, pathPrefix: '/app' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    ...(googleMapsKey ? { config: { googleMaps: { apiKey: googleMapsKey } } } : {}),
    ...(googleServicesAndroid ? { googleServicesFile: googleServicesAndroid } : {}),
  },
  plugins: [
    'expo-router',
    'expo-task-manager',
    'expo-secure-store',
    'expo-font',
    'expo-web-browser',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 160, resizeMode: 'contain', backgroundColor: '#FFFFFF' }],
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
