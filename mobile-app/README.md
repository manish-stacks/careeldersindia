# Care Elders India mobile (Expo SDK 57)

One app, two roles. The server decides which one after sign-in:

- **Customer** (families, often abroad): add parents, book one-off or recurring visits, pay (Razorpay), follow the assistant live, read visit reports and trends, share access with siblings, SOS.
- **Care assistant** (field staff in India): accept/decline visits, start travel (live location), arrive, record the visit (vitals per service, symptoms, medicines, photos, overall status), complete with a retry-safe key, documents, availability, profile.

## Run

```bash
cp .env.example .env          # EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:5000
npm install
npx expo start                # scan with Expo Go (SDK 57) or a dev build
```

Backend must be reachable from the phone. In `backend/.env` also set `API_PUBLIC_URL=http://<your-LAN-IP>:5000` so photo/PDF links open on the phone (the app rewrites `localhost` links as a fallback).

Demo logins (after `npm run seed:reset` in backend): `rohan@example.com` / `Customer@123` (customer), `neha@careeldersindia.com` / `Assistant@123` (assistant with a live visit), `vikram@careeldersindia.com` / `Assistant@123` (pending verification).

## What works where

| Feature | Expo Go | Dev / store build |
|---|---|---|
| Screens, maps, camera, Razorpay (WebView checkout), deep links via `exp://` | ✅ | ✅ |
| Push notifications (incl. admin "open screen" taps) | ❌ (Android throws since SDK 55) | ✅ needs `google-services.json` (Android) + APNs key in Firebase (iOS) |
| Trip location with app open | ✅ | ✅ |
| Trip location in background / screen locked | ⚠️ unreliable | ✅ |
| Trip location after swiping the app away from Recents | ❌ | ✅ Android (foreground service, `killServiceOnDestroy: false`). iOS: Apple stops location for force-quit apps; the server detects the gap and pushes "Tap to resume" |
| Universal / App Links (`https://<host>/app/...`) | ❌ | ✅ once `/.well-known` files are served on the host |

Development build: `npx eas-cli@latest build --profile development --platform android` (profiles in `eas.json`).

## Background trip location

1. Assistant taps **Start travel** → app asks for location, then **Allow all the time** (Android 11+ opens Settings).
2. App requests a **trip token** (`POST /assistant/jobs/:id/trip-token`): valid for one booking, 12 h, rejected by every other API route.
3. `expo-location` background task (`src/lib/background-location.ts`, registered in `index.js` so it runs headless) posts batches to `POST /trip/locations` with `X-Trip-Token`. Offline fixes are queued (last 14 min) and sent with the next fix.
4. Android shows a persistent notification "Sharing your location with the family" — the foreground service keeps running after the app is closed or swiped away.
5. Stops when the assistant taps **I've arrived**, completes the visit, or the server answers `410 TRIP_ENDED` (trip over/cancelled) or the token expires.
6. On every launch the app re-attaches to a running trip or restarts it for an `ON_THE_WAY` job (only if permission is already granted).
7. Server watchdog (every 2 min): on the way but no fix for 5 min → push to the assistant "Location sharing paused — tap to resume" (opens the job, which restarts sharing); 15 min → alert to admins.
8. If only "While using the app" is granted, sharing falls back to foreground-only and the job screen offers **Allow all the time**. Android battery savers (Xiaomi, Oppo, Vivo…) can still kill services — the job screen links to battery settings.

## Deep links & notification screens

Accepted links (all routed by `src/app/+native-intent.tsx` → `src/lib/links.ts`):

| Link | Opens |
|---|---|
| `careeldersindia://booking/<id>` · `https://<host>/app/booking/<id>` · `https://<host>/app/b/<id>` | customer visit |
| `careeldersindia://job/<id>` · `…/app/j/<id>` | assistant job |
| `…/app/r/<id>` · `…/app/p/<id>` | report · plan |
| `…/app/s/<screen>[/<id>]` or `careeldersindia://open?screen=<screen>&id=<id>` | any registered screen, resolved for the signed-in role |

Links opened while signed out are remembered and opened right after sign-in. Wrong-role links fall back to Home/Today.

**Admin → Notifications → "When they tap it, open"**: pick a screen (Home, Visits, Book, Plans, Payments, Reports, a specific visit/report/parent/plan by ID, Today, New jobs, Documents, Availability, Earnings, a specific job, Notifications, Emergency help) or a link. The screen list is served by `GET /admin/notifications/screens` from the backend registry `APP_SCREENS`, filtered by audience. Push data carries `screen` + id; the same routing runs for push taps (including cold start from a killed app) and for taps in the in-app inbox. `https://` links outside your host open in the in-app browser.

Universal links setup: set `EXPO_PUBLIC_APP_LINK_HOST` (app) and `APP_LINK_HOST`, `APPLE_TEAM_ID`, `ANDROID_SHA256_CERT_FINGERPRINTS` (backend). The API serves `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` and an "Open in app" page at `/app/*` — point the host (or reverse-proxy those paths) to the API.

## Structure

```
src/app/                    Expo Router routes
  (auth)/                   login, register, register-assistant, forgot
  (customer)/(tabs)/        home, visits, parents, reports, account
  (customer)/               book, pay, booking/[id], parent/new, parent/[id]/{index,edit,family}, report/[id], plans, plan/[id], payments, profile
  (assistant)/(tabs)/       today, jobs, earnings, me
  (assistant)/              job/[id], visit/[id], documents, availability, profile-edit
  notifications, change-password, sos, open, +native-intent    shared
src/lib/                    api (refresh rotation, SecureStore), auth, socket, push, tracker + background-location, links, format, theme, types
index.js                    entry: registers the background task, then expo-router
src/components/             ui kit, status, visit-summary, sparkline, track-map, inputs, parent-form, toast
```

## Behaviour notes

- Times are India time (IST); customers abroad also see their own local time.
- Access token lives in memory, refresh token in SecureStore; rotation + reuse detection on the server.
- Visit drafts auto-save every 2.5 s; only in-range values are sent. Completing uses an `Idempotency-Key` persisted per visit, so a retry after a network drop never double-completes.
- Customers never see draft values; the summary appears when the assistant completes.
- Health data is shown as recorded measurements and observations, never a diagnosis.

Checks: `npx tsc --noEmit` clean; `npx expo export` bundles for Android and iOS.
