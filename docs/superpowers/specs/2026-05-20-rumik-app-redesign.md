# rumik App Redesign — Full Spec

**Date:** 2026-05-20  
**Status:** Approved  
**Scope:** Auth (Clerk), navigation, music playback, library, UI redesign

---

## 1. Summary

Rebuild the rumik mobile app from a single-screen demo into a full music discovery and listening app with:
- Clerk authentication (email/password + Google OAuth)
- 4-tab navigation + persistent mini-player + Now Playing screen
- Deezer API for real music data (search, trending, charts, 30s previews)
- expo-av for real audio playback
- Per-user library (liked tracks) stored in AsyncStorage keyed to Clerk user ID
- Sand & Slate Blue light theme across all surfaces
- Clerk user ID wired as `installId` for OTA/remote-config targeting

---

## 2. Color System

| Token | Value | Use |
|---|---|---|
| `bg` | `#f5f2ed` | App background, screen base |
| `surface` | `#ede8e0` | Cards, inputs, list items |
| `muted` | `#d8d0c4` | Track thumbnails, disabled elements |
| `accent` | `#3d5a6e` | Primary action, active state, progress bars, play button |
| `accent-deep` | `#2d4a5e` | Pressed state, gradient end |
| `text` | `#18202a` | Primary text |
| `text-secondary` | `#8a8070` | Artist names, secondary labels, section headers |
| `text-muted` | `#b0a898` | Timestamps, disabled text, inactive tab icons |
| `border` | `#e8e2d8` | Dividers, card borders |

Typography: system font stack (`-apple-system / Roboto`). Scale: Display 800/24px · Headline 800/20px · Title 700/16px · Body 600/13px · Label 800/9px uppercase 2px tracking.

---

## 3. Screen Architecture

```
app/
├── (auth)/
│   ├── sign-in.tsx         ← Clerk sign-in (email + Google)
│   └── sign-up.tsx         ← Clerk sign-up
└── (tabs)/
    ├── _layout.tsx         ← Tab bar + mini-player overlay
    ├── index.tsx           ← Home tab
    ├── discover.tsx        ← Discover tab
    ├── library.tsx         ← Library tab
    └── profile.tsx         ← Profile tab

components/
├── player/
│   ├── MiniPlayer.tsx      ← Persistent bar above tab bar
│   └── NowPlaying.tsx      ← Full-screen modal (swipe down to dismiss)
├── track/
│   ├── TrackRow.tsx        ← Track list item (no card wrapper)
│   └── TrackCard.tsx       ← Featured/large track card
├── auth/
│   └── GoogleButton.tsx    ← Google OAuth button
└── ui/
    ├── SectionLabel.tsx    ← Uppercase section header
    └── Pill.tsx            ← Genre/tag pill

services/
├── deezer.ts               ← Deezer API client
├── player.ts               ← expo-av singleton AudioPlayer
└── library.ts              ← AsyncStorage liked tracks (per Clerk user)
```

Navigation via **expo-router** file-based routing. Auth group uses Clerk `useAuth()` redirect guard — unauthenticated users land on `(auth)/sign-in`. Authenticated users land on `(tabs)/index`.

---

## 4. Authentication — Clerk

**Package:** `@clerk/clerk-expo`

**Setup:**
- `ClerkProvider` wraps the root `_layout.tsx` with `publishableKey` from `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` env var
- `useAuth()` in `(tabs)/_layout.tsx` — redirect to `/sign-in` if `!isSignedIn`
- `useUser()` in profile screen and OTA/config wiring

**Sign In screen:**
- Email + password fields (Clerk `SignIn` component or manual `signIn.create()`)
- "Continue with Google" via `useOAuth({ strategy: 'oauth_google' })`
- Link to Sign Up

**Sign Up screen:**
- Name, email, password
- Same Google option

**Clerk user ID as installId:**
```typescript
// In App._layout.tsx, after Clerk loads:
const { user } = useUser();
useEffect(() => {
  if (user?.id) {
    configClient.setInstallId(user.id);
    // OTA client also receives user.id as its installId
  }
}, [user?.id]);
```

---

## 5. Music Data — Deezer API

**Base URL:** `https://api.deezer.com`  
**No API key required** for read-only endpoints.  
**CORS on web:** use a proxy or native-only for web compat (RN native has no CORS).

| Endpoint | Use |
|---|---|
| `GET /chart/0/tracks?limit=20` | Home featured + Discover charts |
| `GET /search?q={query}&limit=30` | Discover search |
| `GET /artist/{id}/top?limit=10` | Artist top tracks |
| `GET /genre/list` | Genre browsing |

**Track shape used throughout:**
```typescript
interface DeezerTrack {
  id: number;
  title: string;
  artist: { id: number; name: string; picture_medium: string };
  album: { id: number; title: string; cover_medium: string };
  preview: string;     // 30s MP3 URL
  duration: number;    // full track duration in seconds
}
```

**`services/deezer.ts`** exports: `getCharts()`, `searchTracks(q)`, `getArtistTracks(artistId)`. All return `DeezerTrack[]`. Uses native `fetch`, no library.

---

## 6. Audio Playback — expo-av

**Package:** `expo-av`

**Singleton pattern** — one `Audio.Sound` instance lives in a React context (`PlayerContext`) so it persists across tab navigation.

```typescript
// services/player.ts
type PlayerState = {
  track: DeezerTrack | null;
  isPlaying: boolean;
  position: number;      // ms
  duration: number;      // ms
  play: (track: DeezerTrack) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
};
```

**Behavior:**
- Tapping play on any `TrackRow` calls `play(track)` — loads preview URL, starts playback
- `MiniPlayer` is always visible when `track !== null`
- `NowPlaying` opens as a full-screen modal (slide up) when tapping the MiniPlayer
- Swipe down or chevron dismisses NowPlaying (mini-player stays visible)
- Audio mode: `Audio.setAudioModeAsync({ playsInSilentModeIOS: true })`
- Progress tracked via `sound.setOnPlaybackStatusUpdate()`

---

## 7. Screens

### Home (`(tabs)/index.tsx`)
- Greeting: "Good evening, {firstName}" using `useUser()`
- Recently played: last 5 tracks from `AsyncStorage` (`recentlyPlayed`)
- Featured: top chart track from Deezer (large `TrackCard`)
- Section: "Charts" — first 8 from `getCharts()`
- Each row: `TrackRow` (thumbnail, title, artist, play button)

### Discover (`(tabs)/discover.tsx`)
- Search bar (debounced, 300ms) — calls `searchTracks(q)` when query ≥ 2 chars
- Trending artists (Deezer chart artists, horizontal scroll)
- Charts list: ranked `TrackRow` with `#N` label
- Empty/idle state: "Search for any artist or track"

### Library (`(tabs)/library.tsx`)
- Filter pills: Liked / Artists / Albums
- **Liked** tab: `TrackRow` list from `services/library.ts` (AsyncStorage, keyed by `${clerkUserId}:liked`)
- Heart icon on every `TrackRow` — toggles liked state, updates AsyncStorage
- Empty state: "Nothing liked yet. Tap ♥ on any track."

### Profile (`(tabs)/profile.tsx`)
- Clerk avatar + name + email (from `useUser()`)
- Stats: liked count, artist count
- App info: version from `Constants.expoConfig.version`, OTA channel, OTA status from `useOta()`
- "Sign out" → `signOut()` from Clerk → redirects to sign-in

### MiniPlayer (`components/player/MiniPlayer.tsx`)
- Shown above tab bar whenever `track !== null`
- Album art (32×32), track title (truncated), scrubber line, pause/next buttons
- Tap anywhere → open NowPlaying modal

### NowPlaying (`components/player/NowPlaying.tsx`)
- Full screen, presented as modal
- 120×120 album art with `box-shadow: 0 8px 24px rgba(61,90,110,0.25)`
- Title (800/16px), artist (400/12px), genre pills
- Scrubber: custom slider, position/duration labels
- Controls: previous (disabled — preview only), play/pause, next (disabled)
- Actions: shuffle (cosmetic), like (heart, wires to library), repeat (cosmetic)
- Swipe down gesture to dismiss

---

## 8. Library Persistence

`services/library.ts` wraps AsyncStorage:

```typescript
const key = (userId: string) => `rumik:${userId}:liked`;

export async function getLiked(userId: string): Promise<DeezerTrack[]>
export async function toggleLike(userId: string, track: DeezerTrack): Promise<boolean>
export async function isLiked(userId: string, trackId: number): Promise<boolean>

// Recently played (per user, last 20)
const recentKey = (userId: string) => `rumik:${userId}:recent`;
export async function pushRecent(userId: string, track: DeezerTrack): Promise<void>
export async function getRecent(userId: string): Promise<DeezerTrack[]>
```

All library operations are scoped to the Clerk user ID — data is isolated per account.

---

## 9. OTA / Remote Config Wiring

Existing `ConfigClient` and `OtaClient` are preserved. Changes:

1. `OTA_SERVER_URL` moves from hardcoded `http://192.168.1.4:4000` to `EXPO_PUBLIC_OTA_SERVER_URL` env var (falls back to empty string → disables OTA in dev)
2. `ConfigClient.setInstallId(clerkUserId)` called as soon as Clerk user loads
3. `useOtaUpdate` hook: `serverUrl` reads `process.env.EXPO_PUBLIC_OTA_SERVER_URL`
4. Profile screen shows OTA version and channel from `useOta()` status

---

## 10. New Dependencies

| Package | Version | Use |
|---|---|---|
| `@clerk/clerk-expo` | latest | Auth |
| `expo-router` | ~4.x | File-based navigation |
| `expo-av` | ~15.x | Audio playback |
| `expo-web-browser` | ~14.x | OAuth redirect handler |
| `expo-auth-session` | ~6.x | Google OAuth PKCE |

Remove: direct `react-navigation` deps (expo-router wraps it).

---

## 11. What Stays Unchanged

- `src/services/ota/` — OtaClient, CrashTracker, PerfTracker, EventReporter, ErrorReporter
- `src/services/config/` — ConfigClient, WsClient, storage
- `src/hooks/useOtaUpdate.ts` — minor env var update only
- `src/hooks/useRemoteConfig.tsx` — unchanged
- `ota-server/` — untouched
- All CI/CD, observability stack — untouched
- `src/components/UpdateBanner.tsx` — kept, restyled to Sand & Slate palette

---

## 12. File Migrations

| Current | New |
|---|---|
| `App.tsx` | `app/_layout.tsx` (expo-router root) |
| `src/screens/HomeScreen.tsx` | `app/(tabs)/index.tsx` |
| `src/components/UpdateBanner.tsx` | kept, restyled |

`src/` service files stay in place — expo-router resolves from project root.

---

## 13. Non-Goals

- Full track playback (Deezer previews are 30s max without auth)
- Playlist creation
- Offline mode / download
- Push notifications
- Social features
