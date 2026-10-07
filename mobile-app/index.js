// Background tasks must be registered before the router mounts, so the OS can run them
// even when the app was closed (Android foreground service / iOS background relaunch).
import './src/lib/background-location';
import 'expo-router/entry';
