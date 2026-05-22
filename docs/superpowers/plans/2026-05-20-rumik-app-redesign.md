# rumik App Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild rumik from a single-screen demo into a full music app with Clerk auth, Deezer music data, real audio playback (expo-av), 4-tab navigation, and a Sand & Slate Blue light theme.

**Architecture:** expo-router file-based routing with `(auth)/` and `(tabs)/` route groups; Clerk ClerkProvider at the root; a singleton AudioPlayer context persists across tabs; Deezer public API (no key) for music data; AsyncStorage library scoped to Clerk user ID.

**Tech Stack:** `@clerk/clerk-expo`, `expo-router`, `expo-av`, `expo-web-browser`, `expo-auth-session`, `@react-native-async-storage/async-storage` (already installed)

**Spec:** `docs/superpowers/specs/2026-05-20-rumik-app-redesign.md`

---

## Task 1: Install dependencies and configure expo-router

**Files:**
- Modify: `package.json`
- Modify: `app.json`
- Create: `app/_layout.tsx` (stub only)

- [ ] **Step 1: Install packages**

```bash
cd "E:/Java WorkSpace/rumik-app"
npx expo install expo-router expo-av expo-web-browser expo-auth-session expo-linking
pnpm add @clerk/clerk-expo
```

Expected: packages added with no peer errors.

- [ ] **Step 2: Update package.json main field**

Change `"main": "index.ts"` to `"main": "expo-router/entry"`.

- [ ] **Step 3: Update app.json for expo-router and OAuth**

In `app.json` inside `"expo"`, add/update:
```json
{
  "scheme": "rumik",
  "plugins": [
    "expo-router",
    "expo-build-properties"
  ],
  "web": {
    "bundler": "metro",
    "output": "static",
    "favicon": "./assets/favicon.png"
  }
}
```

- [ ] **Step 4: Create the stub root layout**

Create `app/_layout.tsx`:
```tsx
import { Slot } from 'expo-router';

export default function RootLayout() {
  return <Slot />;
}
```

- [ ] **Step 5: Verify the app still launches**

```bash
pnpm start --web
```
Expected: app loads at http://localhost:8081 (may show blank — that's fine, routing not wired yet).

- [ ] **Step 6: Commit**

```bash
git add app/_layout.tsx app.json package.json pnpm-lock.yaml
git commit -m "feat(app): install expo-router, clerk, expo-av; configure routing"
```

---

## Task 2: Design tokens

**Files:**
- Create: `src/theme/tokens.ts`

- [ ] **Step 1: Create tokens file**

Create `src/theme/tokens.ts`:
```typescript
export const Colors = {
  bg: '#f5f2ed',
  surface: '#ede8e0',
  muted: '#d8d0c4',
  accent: '#3d5a6e',
  accentDeep: '#2d4a5e',
  text: '#18202a',
  textSecondary: '#8a8070',
  textMuted: '#b0a898',
  border: '#e8e2d8',
  white: '#fdfcfa',
} as const;

export const Typography = {
  display: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -1 },
  headline: { fontSize: 20, fontWeight: '800' as const },
  title: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 13, fontWeight: '600' as const },
  bodySecondary: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 9, fontWeight: '800' as const, letterSpacing: 2, textTransform: 'uppercase' as const },
  caption: { fontSize: 10, fontWeight: '400' as const },
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  full: 999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
} as const;
```

- [ ] **Step 2: Write a smoke test**

Create `src/__tests__/theme/tokens.test.ts`:
```typescript
import { Colors, Typography, Radius, Spacing } from '../../theme/tokens';

describe('design tokens', () => {
  it('has all required color tokens', () => {
    expect(Colors.bg).toBeDefined();
    expect(Colors.accent).toBeDefined();
    expect(Colors.text).toBeDefined();
  });

  it('accent color is the slate blue', () => {
    expect(Colors.accent).toBe('#3d5a6e');
  });
});
```

- [ ] **Step 3: Run test**

```bash
cd "E:/Java WorkSpace/rumik-app" && npm test -- --testPathPattern=tokens
```
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/theme/tokens.ts src/__tests__/theme/tokens.test.ts
git commit -m "feat(theme): add Sand & Slate Blue design tokens"
```

---

## Task 3: Shared UI components

**Files:**
- Create: `src/components/ui/SectionLabel.tsx`
- Create: `src/components/ui/Pill.tsx`

- [ ] **Step 1: Create SectionLabel**

Create `src/components/ui/SectionLabel.tsx`:
```tsx
import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../../theme/tokens';

interface Props {
  children: string;
}

export function SectionLabel({ children }: Props) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: {
    ...Typography.label,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
});
```

- [ ] **Step 2: Create Pill**

Create `src/components/ui/Pill.tsx`:
```tsx
import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../theme/tokens';

interface Props {
  label: string;
  active?: boolean;
}

export function Pill({ label, active = false }: Props) {
  return (
    <View style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs - 1,
  },
  pillActive: { backgroundColor: Colors.accent },
  text: { ...Typography.label, color: Colors.textSecondary },
  textActive: { color: Colors.white },
});
```

- [ ] **Step 3: Write tests**

Create `src/__tests__/components/ui/Pill.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { Pill } from '../../../components/ui/Pill';

describe('Pill', () => {
  it('renders the label text', () => {
    const { getByText } = render(<Pill label="electronic" />);
    expect(getByText('electronic')).toBeTruthy();
  });

  it('applies active styles when active=true', () => {
    const { getByText } = render(<Pill label="electronic" active />);
    const text = getByText('electronic');
    expect(text.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: '#fdfcfa' })])
    );
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --testPathPattern=Pill
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ src/__tests__/components/ui/
git commit -m "feat(ui): add SectionLabel and Pill components"
```

---

## Task 4: TrackRow component

**Files:**
- Create: `src/components/track/TrackRow.tsx`
- Create: `src/__tests__/components/track/TrackRow.test.tsx`

- [ ] **Step 1: Define DeezerTrack type (shared)**

Create `src/services/deezer.ts` with just the type for now (we'll fill the API calls in Task 5):
```typescript
export interface DeezerTrack {
  id: number;
  title: string;
  artist: {
    id: number;
    name: string;
    picture_medium: string;
  };
  album: {
    id: number;
    title: string;
    cover_medium: string;
  };
  preview: string;
  duration: number;
}
```

- [ ] **Step 2: Create TrackRow**

Create `src/components/track/TrackRow.tsx`:
```tsx
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../theme/tokens';
import type { DeezerTrack } from '../../services/deezer';

interface Props {
  track: DeezerTrack;
  onPlay: (track: DeezerTrack) => void;
  rank?: number;
  isLiked?: boolean;
  onLike?: (track: DeezerTrack) => void;
  showLike?: boolean;
}

export function TrackRow({ track, onPlay, rank, isLiked, onLike, showLike }: Props) {
  return (
    <View style={styles.row}>
      {rank !== undefined && (
        <Text style={styles.rank}>#{rank}</Text>
      )}
      <Image
        source={{ uri: track.album.cover_medium }}
        style={styles.thumb}
        defaultSource={require('../../../assets/icon.png')}
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{track.artist.name}</Text>
      </View>
      {showLike && onLike && (
        <TouchableOpacity onPress={() => onLike(track)} style={styles.action} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.heart, isLiked && styles.heartActive]}>♥</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={() => onPlay(track)} style={styles.action} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.playIcon}>▶</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rank: { ...Typography.label, color: Colors.accent, width: 24 },
  thumb: { width: 44, height: 44, borderRadius: Radius.sm, marginRight: Spacing.sm, backgroundColor: Colors.muted },
  info: { flex: 1, marginRight: Spacing.xs },
  title: { ...Typography.body, color: Colors.text },
  artist: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  action: { paddingHorizontal: Spacing.xs },
  playIcon: { fontSize: 14, color: Colors.accent },
  heart: { fontSize: 16, color: Colors.muted },
  heartActive: { color: Colors.accent },
});
```

- [ ] **Step 3: Write tests**

Create `src/__tests__/components/track/TrackRow.test.tsx`:
```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TrackRow } from '../../../components/track/TrackRow';
import type { DeezerTrack } from '../../../services/deezer';

const mockTrack: DeezerTrack = {
  id: 1,
  title: 'Neon Drift',
  artist: { id: 10, name: 'Synthwave Radio', picture_medium: '' },
  album: { id: 100, title: 'Test Album', cover_medium: '' },
  preview: 'https://example.com/preview.mp3',
  duration: 30,
};

describe('TrackRow', () => {
  it('renders track title and artist', () => {
    const { getByText } = render(
      <TrackRow track={mockTrack} onPlay={jest.fn()} />
    );
    expect(getByText('Neon Drift')).toBeTruthy();
    expect(getByText('Synthwave Radio')).toBeTruthy();
  });

  it('calls onPlay when play button tapped', () => {
    const onPlay = jest.fn();
    const { getByText } = render(<TrackRow track={mockTrack} onPlay={onPlay} />);
    fireEvent.press(getByText('▶'));
    expect(onPlay).toHaveBeenCalledWith(mockTrack);
  });

  it('shows rank when provided', () => {
    const { getByText } = render(<TrackRow track={mockTrack} onPlay={jest.fn()} rank={1} />);
    expect(getByText('#1')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --testPathPattern=TrackRow
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/track/TrackRow.tsx src/services/deezer.ts src/__tests__/components/track/
git commit -m "feat(components): add TrackRow component with play/like actions"
```

---

## Task 5: Deezer API service

**Files:**
- Modify: `src/services/deezer.ts` (add API functions)
- Create: `src/__tests__/services/deezer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/services/deezer.test.ts`:
```typescript
import { getCharts, searchTracks } from '../../services/deezer';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockTrack = {
  id: 1,
  title: 'Test Track',
  artist: { id: 10, name: 'Test Artist', picture_medium: 'https://example.com/pic.jpg' },
  album: { id: 100, title: 'Test Album', cover_medium: 'https://example.com/cover.jpg' },
  preview: 'https://example.com/preview.mp3',
  duration: 30,
};

beforeEach(() => mockFetch.mockReset());

describe('getCharts', () => {
  it('returns tracks from chart endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [mockTrack] }),
    });
    const tracks = await getCharts();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe('Test Track');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.deezer.com/chart/0/tracks?limit=20'
    );
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const tracks = await getCharts();
    expect(tracks).toEqual([]);
  });
});

describe('searchTracks', () => {
  it('returns tracks matching query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [mockTrack] }),
    });
    const tracks = await searchTracks('synthwave');
    expect(tracks).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.deezer.com/search?q=synthwave&limit=30'
    );
  });

  it('returns empty array for empty query', async () => {
    const tracks = await searchTracks('');
    expect(tracks).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=services/deezer
```
Expected: FAIL — `getCharts`, `searchTracks` not exported from deezer.ts.

- [ ] **Step 3: Implement the Deezer service**

Replace contents of `src/services/deezer.ts` with:
```typescript
const BASE = 'https://api.deezer.com';

export interface DeezerTrack {
  id: number;
  title: string;
  artist: { id: number; name: string; picture_medium: string };
  album: { id: number; title: string; cover_medium: string };
  preview: string;
  duration: number;
}

async function fetchDeezer<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function getCharts(limit = 20): Promise<DeezerTrack[]> {
  const data = await fetchDeezer<{ data: DeezerTrack[] }>(
    `/chart/0/tracks?limit=${limit}`
  );
  return data?.data ?? [];
}

export async function searchTracks(query: string, limit = 30): Promise<DeezerTrack[]> {
  if (!query.trim()) return [];
  const data = await fetchDeezer<{ data: DeezerTrack[] }>(
    `/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  return data?.data ?? [];
}

export async function getArtistTracks(artistId: number, limit = 10): Promise<DeezerTrack[]> {
  const data = await fetchDeezer<{ data: DeezerTrack[] }>(
    `/artist/${artistId}/top?limit=${limit}`
  );
  return data?.data ?? [];
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --testPathPattern=services/deezer
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/deezer.ts src/__tests__/services/deezer.test.ts
git commit -m "feat(services): add Deezer API client (charts, search, artist tracks)"
```

---

## Task 6: Library persistence service

**Files:**
- Create: `src/services/library.ts`
- Create: `src/__tests__/services/library.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/services/library.test.ts`:
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLiked, toggleLike, isLiked, pushRecent, getRecent } from '../../services/library';
import type { DeezerTrack } from '../../services/deezer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const USER = 'user_clerk_123';
const mockTrack: DeezerTrack = {
  id: 1,
  title: 'Neon Drift',
  artist: { id: 10, name: 'Artist', picture_medium: '' },
  album: { id: 100, title: 'Album', cover_medium: '' },
  preview: 'https://example.com/p.mp3',
  duration: 30,
};

beforeEach(() => AsyncStorage.clear());

describe('liked tracks', () => {
  it('starts empty', async () => {
    expect(await getLiked(USER)).toEqual([]);
  });

  it('toggleLike adds a track', async () => {
    const liked = await toggleLike(USER, mockTrack);
    expect(liked).toBe(true);
    expect(await getLiked(USER)).toHaveLength(1);
  });

  it('toggleLike removes a liked track', async () => {
    await toggleLike(USER, mockTrack);
    const liked = await toggleLike(USER, mockTrack);
    expect(liked).toBe(false);
    expect(await getLiked(USER)).toHaveLength(0);
  });

  it('isLiked returns true after like', async () => {
    await toggleLike(USER, mockTrack);
    expect(await isLiked(USER, mockTrack.id)).toBe(true);
  });
});

describe('recently played', () => {
  it('pushRecent adds track to front', async () => {
    await pushRecent(USER, mockTrack);
    const recent = await getRecent(USER);
    expect(recent[0].id).toBe(mockTrack.id);
  });

  it('caps at 20 entries', async () => {
    for (let i = 0; i < 25; i++) {
      await pushRecent(USER, { ...mockTrack, id: i });
    }
    expect(await getRecent(USER)).toHaveLength(20);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npm test -- --testPathPattern=services/library
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement library service**

Create `src/services/library.ts`:
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DeezerTrack } from './deezer';

const likedKey = (userId: string) => `rumik:${userId}:liked`;
const recentKey = (userId: string) => `rumik:${userId}:recent`;

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJSON<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getLiked(userId: string): Promise<DeezerTrack[]> {
  return readJSON<DeezerTrack[]>(likedKey(userId), []);
}

export async function toggleLike(userId: string, track: DeezerTrack): Promise<boolean> {
  const liked = await getLiked(userId);
  const idx = liked.findIndex((t) => t.id === track.id);
  if (idx >= 0) {
    liked.splice(idx, 1);
    await writeJSON(likedKey(userId), liked);
    return false;
  }
  await writeJSON(likedKey(userId), [track, ...liked]);
  return true;
}

export async function isLiked(userId: string, trackId: number): Promise<boolean> {
  const liked = await getLiked(userId);
  return liked.some((t) => t.id === trackId);
}

export async function pushRecent(userId: string, track: DeezerTrack): Promise<void> {
  const recent = await readJSON<DeezerTrack[]>(recentKey(userId), []);
  const filtered = recent.filter((t) => t.id !== track.id);
  await writeJSON(recentKey(userId), [track, ...filtered].slice(0, 20));
}

export async function getRecent(userId: string): Promise<DeezerTrack[]> {
  return readJSON<DeezerTrack[]>(recentKey(userId), []);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --testPathPattern=services/library
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/library.ts src/__tests__/services/library.test.ts
git commit -m "feat(services): add library persistence (liked tracks + recently played)"
```

---

## Task 7: AudioPlayer context

**Files:**
- Create: `src/services/player.ts`
- Create: `src/__tests__/services/player.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/services/player.test.ts`:
```typescript
import { renderHook, act } from '@testing-library/react-native';
import { PlayerProvider, usePlayer } from '../../services/player';
import React from 'react';

jest.mock('expo-av', () => ({
  Audio: {
    Sound: { createAsync: jest.fn() },
    setAudioModeAsync: jest.fn(),
  },
}));

import { Audio } from 'expo-av';

const mockSound = {
  playAsync: jest.fn().mockResolvedValue({}),
  pauseAsync: jest.fn().mockResolvedValue({}),
  setPositionAsync: jest.fn().mockResolvedValue({}),
  unloadAsync: jest.fn().mockResolvedValue({}),
  setOnPlaybackStatusUpdate: jest.fn(),
};

const mockTrack = {
  id: 1,
  title: 'Test',
  artist: { id: 1, name: 'Artist', picture_medium: '' },
  album: { id: 1, title: 'Album', cover_medium: '' },
  preview: 'https://example.com/p.mp3',
  duration: 30,
};

beforeEach(() => {
  jest.clearAllMocks();
  (Audio.Sound.createAsync as jest.Mock).mockResolvedValue({
    sound: mockSound,
    status: { isLoaded: true, durationMillis: 30000 },
  });
});

describe('usePlayer', () => {
  it('starts with no track', () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: ({ children }) => React.createElement(PlayerProvider, null, children),
    });
    expect(result.current.track).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it('play() sets the current track', async () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: ({ children }) => React.createElement(PlayerProvider, null, children),
    });
    await act(async () => { await result.current.play(mockTrack); });
    expect(result.current.track?.id).toBe(1);
  });

  it('pause() sets isPlaying to false', async () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: ({ children }) => React.createElement(PlayerProvider, null, children),
    });
    await act(async () => { await result.current.play(mockTrack); });
    await act(async () => { await result.current.pause(); });
    expect(result.current.isPlaying).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npm test -- --testPathPattern=services/player
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PlayerContext**

Create `src/services/player.ts`:
```typescript
import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { Audio } from 'expo-av';
import type { DeezerTrack } from './deezer';

interface PlayerState {
  track: DeezerTrack | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  play: (track: DeezerTrack) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
}

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [track, setTrack] = useState<DeezerTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  const unloadCurrent = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
  }, []);

  const play = useCallback(async (newTrack: DeezerTrack) => {
    await unloadCurrent();
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound, status } = await Audio.Sound.createAsync(
      { uri: newTrack.preview },
      { shouldPlay: true }
    );
    soundRef.current = sound;
    setTrack(newTrack);
    setIsPlaying(true);
    if (status.isLoaded && status.durationMillis) {
      setDurationMs(status.durationMillis);
    }
    sound.setOnPlaybackStatusUpdate((s) => {
      if (!s.isLoaded) return;
      setPositionMs(s.positionMillis ?? 0);
      setIsPlaying(s.isPlaying);
      if (s.didJustFinish) setIsPlaying(false);
    });
  }, [unloadCurrent]);

  const pause = useCallback(async () => {
    await soundRef.current?.pauseAsync();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(async () => {
    await soundRef.current?.playAsync();
    setIsPlaying(true);
  }, []);

  const seek = useCallback(async (ms: number) => {
    await soundRef.current?.setPositionAsync(ms);
  }, []);

  return (
    <PlayerContext.Provider value={{ track, isPlaying, positionMs, durationMs, play, pause, resume, seek }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --testPathPattern=services/player
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/player.ts src/__tests__/services/player.test.ts
git commit -m "feat(services): add AudioPlayer context with expo-av (play/pause/seek)"
```

---

## Task 8: Clerk auth setup and screens

**Files:**
- Create: `app/(auth)/_layout.tsx`
- Create: `app/(auth)/sign-in.tsx`
- Create: `app/(auth)/sign-up.tsx`
- Modify: `app/_layout.tsx` (add ClerkProvider)

**Prerequisite:** Get a Clerk publishable key at https://clerk.com → create app → copy `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.

- [ ] **Step 1: Add env var**

Create `.env.local` (gitignored):
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
```

Verify `.env.local` is in `.gitignore`. Add if missing:
```bash
echo ".env.local" >> .gitignore
```

- [ ] **Step 2: Update root layout with ClerkProvider**

Replace `app/_layout.tsx`:
```tsx
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { tokenCache } from '../src/utils/tokenCache';
import { Slot } from 'expo-router';
import { PlayerProvider } from '../src/services/player';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <PlayerProvider>
          <Slot />
        </PlayerProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
```

- [ ] **Step 3: Create tokenCache utility**

Create `src/utils/tokenCache.ts`:
```typescript
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const createTokenCache = () => ({
  getToken: (key: string) =>
    Platform.OS === 'web' ? null : SecureStore.getItemAsync(key),
  saveToken: (key: string, token: string) =>
    Platform.OS === 'web' ? null : SecureStore.setItemAsync(key, token),
  clearToken: (key: string) =>
    Platform.OS === 'web' ? null : SecureStore.deleteItemAsync(key),
});

export const tokenCache = createTokenCache();
```

Install expo-secure-store if not present:
```bash
npx expo install expo-secure-store
```

- [ ] **Step 4: Create auth group layout**

Create `app/(auth)/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';
import { Colors } from '../../src/theme/tokens';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }} />
  );
}
```

- [ ] **Step 5: Create sign-in screen**

Create `app/(auth)/sign-in.tsx`:
```tsx
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useSignIn, useOAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../src/theme/tokens';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!isLoaded || !email || !password) return;
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      const { createdSessionId, setActive: setOAuthActive } = await startOAuthFlow();
      if (createdSessionId && setOAuthActive) {
        await setOAuthActive({ session: createdSessionId });
        router.replace('/(tabs)');
      }
    } catch (err: unknown) {
      Alert.alert('Google sign in failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.brand}>RUMIK</Text>
        <Text style={styles.tagline}>feel the music</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={Colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.primaryBtn} onPress={handleSignIn} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.primaryBtnText}>Sign in</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={handleGoogle}>
          <Text style={styles.secondaryBtnText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/sign-up')}>
          <Text style={styles.link}>New to rumik? <Text style={styles.linkAccent}>Create account</Text></Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl },
  brand: { ...Typography.label, color: Colors.accent, textAlign: 'center', marginBottom: Spacing.xs },
  tagline: { ...Typography.display, color: Colors.text, textAlign: 'center', marginBottom: Spacing.xl * 2 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  primaryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  primaryBtnText: { ...Typography.body, color: Colors.white, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryBtnText: { ...Typography.body, color: Colors.text },
  link: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
  linkAccent: { color: Colors.accent, fontWeight: '600' },
});
```

- [ ] **Step 6: Create sign-up screen**

Create `app/(auth)/sign-up.tsx`:
```tsx
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../src/theme/tokens';

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await signUp.create({ firstName, emailAddress: email, password });
      await result.prepareEmailAddressVerification({ strategy: 'email_code' });
      // For simplicity, attempt complete directly (works in dev mode)
      const complete = await signUp.attemptEmailAddressVerification({ code: '000000' }).catch(() => null);
      if (complete?.status === 'complete' && complete.createdSessionId) {
        await setActive({ session: complete.createdSessionId });
        router.replace('/(tabs)');
      } else {
        Alert.alert('Check your email', 'A verification link has been sent. After verifying, return to sign in.');
        router.replace('/(auth)/sign-in');
      }
    } catch (err: unknown) {
      Alert.alert('Sign up failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create account</Text>

        <TextInput style={styles.input} placeholder="First name" placeholderTextColor={Colors.textSecondary} value={firstName} onChangeText={setFirstName} />
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={Colors.textSecondary} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor={Colors.textSecondary} value={password} onChangeText={setPassword} secureTextEntry />

        <TouchableOpacity style={styles.primaryBtn} onPress={handleSignUp} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryBtnText}>Create account</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl },
  back: { position: 'absolute', top: Spacing.xl * 2, left: Spacing.xl },
  backText: { ...Typography.body, color: Colors.accent },
  title: { ...Typography.headline, color: Colors.text, marginBottom: Spacing.lg },
  input: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, ...Typography.body, color: Colors.text, marginBottom: Spacing.sm },
  primaryBtn: { backgroundColor: Colors.accent, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  primaryBtnText: { ...Typography.body, color: Colors.white, fontWeight: '700' },
});
```

- [ ] **Step 7: Verify app loads sign-in**

```bash
pnpm start --web
```
Navigate to http://localhost:8081 — should render the sign-in screen. Check no TypeScript errors:
```bash
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add app/_layout.tsx app/(auth)/ src/utils/tokenCache.ts .gitignore
git commit -m "feat(auth): add Clerk sign-in and sign-up screens with Google OAuth"
```

---

## Task 9: Tab layout with auth guard and MiniPlayer

**Files:**
- Create: `app/(tabs)/_layout.tsx`
- Create: `src/components/player/MiniPlayer.tsx`

- [ ] **Step 1: Create MiniPlayer**

Create `src/components/player/MiniPlayer.tsx`:
```tsx
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { usePlayer } from '../../services/player';
import { Colors, Typography, Spacing, Radius } from '../../theme/tokens';

interface Props {
  onExpand: () => void;
}

export function MiniPlayer({ onExpand }: Props) {
  const { track, isPlaying, positionMs, durationMs, pause, resume } = usePlayer();
  if (!track) return null;

  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  return (
    <TouchableOpacity style={styles.container} onPress={onExpand} activeOpacity={0.95}>
      <Image source={{ uri: track.album.cover_medium }} style={styles.art} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title} — {track.artist.name}
        </Text>
        <View style={styles.bar}>
          <View style={[styles.progress, { width: `${progress * 100}%` }]} />
        </View>
      </View>
      <TouchableOpacity
        onPress={(e) => { e.stopPropagation(); isPlaying ? pause() : resume(); }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.control}>{isPlaying ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  art: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.muted },
  info: { flex: 1 },
  title: { ...Typography.caption, color: Colors.text, fontWeight: '600' },
  bar: { height: 2, backgroundColor: Colors.muted, borderRadius: 2, marginTop: 5, overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: Colors.accent, borderRadius: 2 },
  control: { fontSize: 18, color: Colors.accent, paddingLeft: Spacing.xs },
});
```

- [ ] **Step 2: Create tab layout**

Create `app/(tabs)/_layout.tsx`:
```tsx
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useEffect } from 'react';
import { MiniPlayer } from '../../src/components/player/MiniPlayer';
import { NowPlaying } from '../../src/components/player/NowPlaying';
import { Colors } from '../../src/theme/tokens';
import { configClientRef } from '../../src/utils/configClientRef';

export default function TabsLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [nowPlayingVisible, setNowPlayingVisible] = useState(false);

  // Auth guard
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/(auth)/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  // Wire Clerk user ID to OTA/config
  useEffect(() => {
    if (user?.id) {
      configClientRef.current?.setInstallId(user.id);
    }
  }, [user?.id]);

  if (!isLoaded || !isSignedIn) return null;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon label="🏠" color={color} /> }} />
        <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: ({ color }) => <TabIcon label="🔍" color={color} /> }} />
        <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: ({ color }) => <TabIcon label="📚" color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon label="👤" color={color} /> }} />
      </Tabs>
      <MiniPlayer onExpand={() => setNowPlayingVisible(true)} />
      <NowPlaying visible={nowPlayingVisible} onClose={() => setNowPlayingVisible(false)} />
    </View>
  );
}

function TabIcon({ label, color }: { label: string; color: string }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 18, opacity: color === Colors.accent ? 1 : 0.5 }}>{label}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  tabBar: { backgroundColor: Colors.bg, borderTopColor: Colors.border, borderTopWidth: 1, elevation: 0 },
});
```

- [ ] **Step 3: Create configClientRef utility**

Create `src/utils/configClientRef.ts`:
```typescript
import { createRef } from 'react';
import type { ConfigClient } from '../services/config/ConfigClient';

export const configClientRef = createRef<ConfigClient | null>() as React.MutableRefObject<ConfigClient | null>;
```

- [ ] **Step 4: Create stub NowPlaying (to unblock compilation)**

Create `src/components/player/NowPlaying.tsx` — stub:
```tsx
import React from 'react';
import { Modal, View } from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function NowPlaying({ visible, onClose }: Props) {
  return <Modal visible={visible} onRequestClose={onClose} animationType="slide"><View /></Modal>;
}
```

- [ ] **Step 5: Verify type checks**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/ src/components/player/ src/utils/
git commit -m "feat(nav): add tab layout with auth guard, MiniPlayer, NowPlaying stub"
```

---

## Task 10: Home screen

**Files:**
- Create: `app/(tabs)/index.tsx`

- [ ] **Step 1: Implement Home screen**

Create `app/(tabs)/index.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { SectionLabel } from '../../src/components/ui/SectionLabel';
import { TrackRow } from '../../src/components/track/TrackRow';
import { TrackCard } from '../../src/components/track/TrackCard';
import { usePlayer } from '../../src/services/player';
import { getCharts, type DeezerTrack } from '../../src/services/deezer';
import { getRecent, pushRecent, toggleLike, isLiked } from '../../src/services/library';
import { Colors, Typography, Spacing } from '../../src/theme/tokens';

export default function HomeScreen() {
  const { user } = useUser();
  const { play, track: currentTrack } = usePlayer();
  const [charts, setCharts] = useState<DeezerTrack[]>([]);
  const [recent, setRecent] = useState<DeezerTrack[]>([]);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());

  const userId = user?.id ?? '';

  useEffect(() => {
    getCharts().then(setCharts);
  }, []);

  useEffect(() => {
    if (!userId) return;
    getRecent(userId).then(setRecent);
  }, [userId]);

  const handlePlay = async (track: DeezerTrack) => {
    await play(track);
    if (userId) await pushRecent(userId, track);
  };

  const handleLike = async (track: DeezerTrack) => {
    if (!userId) return;
    await toggleLike(userId, track);
    const liked = await isLiked(userId, track.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      liked ? next.add(track.id) : next.delete(track.id);
      return next;
    });
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const featured = charts[0];
  const chartList = charts.slice(1, 9);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}{user?.firstName ? `, ${user.firstName}` : ''}</Text>
            <Text style={styles.wordmark}>rumik</Text>
          </View>
        </View>

        {recent.length > 0 && (
          <>
            <SectionLabel>RECENTLY PLAYED</SectionLabel>
            {recent.slice(0, 5).map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                onPlay={handlePlay}
                isLiked={likedIds.has(track.id)}
                onLike={handleLike}
                showLike
              />
            ))}
          </>
        )}

        {featured && (
          <>
            <SectionLabel>FEATURED</SectionLabel>
            <TrackCard track={featured} onPlay={handlePlay} label="NEW RELEASE" />
          </>
        )}

        {chartList.length > 0 && (
          <>
            <SectionLabel>CHARTS</SectionLabel>
            {chartList.map((track, i) => (
              <TrackRow
                key={track.id}
                track={track}
                onPlay={handlePlay}
                rank={i + 2}
                isLiked={likedIds.has(track.id)}
                onLike={handleLike}
                showLike
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: Spacing.lg },
  greeting: { ...Typography.label, color: Colors.textSecondary },
  wordmark: { fontSize: 28, fontWeight: '800', letterSpacing: -1, color: Colors.text, marginTop: 2 },
});
```

- [ ] **Step 2: Create TrackCard component**

Create `src/components/track/TrackCard.tsx`:
```tsx
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../theme/tokens';
import type { DeezerTrack } from '../../services/deezer';

interface Props {
  track: DeezerTrack;
  onPlay: (track: DeezerTrack) => void;
  label?: string;
}

export function TrackCard({ track, onPlay, label }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPlay(track)} activeOpacity={0.85}>
      <Image source={{ uri: track.album.cover_medium }} style={styles.art} />
      <View style={styles.info}>
        {label && <Text style={styles.label}>{label}</Text>}
        <Text style={styles.title} numberOfLines={2}>{track.title}</Text>
        <Text style={styles.artist}>{track.artist.name}</Text>
      </View>
      <Text style={styles.play}>▶</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  art: { width: 56, height: 56, borderRadius: Radius.md, backgroundColor: Colors.muted },
  info: { flex: 1 },
  label: { ...Typography.label, color: Colors.accent, marginBottom: 3 },
  title: { ...Typography.title, color: Colors.text },
  artist: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  play: { fontSize: 16, color: Colors.accent },
});
```

- [ ] **Step 3: Type check**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/index.tsx src/components/track/TrackCard.tsx
git commit -m "feat(screens): implement Home screen with charts and recent tracks"
```

---

## Task 11: Discover screen

**Files:**
- Create: `app/(tabs)/discover.tsx`

- [ ] **Step 1: Implement Discover screen**

Create `app/(tabs)/discover.tsx`:
```tsx
import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet, SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { SectionLabel } from '../../src/components/ui/SectionLabel';
import { TrackRow } from '../../src/components/track/TrackRow';
import { usePlayer } from '../../src/services/player';
import { useUser } from '@clerk/clerk-expo';
import { searchTracks, getCharts, type DeezerTrack } from '../../src/services/deezer';
import { pushRecent, toggleLike, isLiked } from '../../src/services/library';
import { Colors, Typography, Spacing, Radius } from '../../src/theme/tokens';
import { useEffect, useRef } from 'react';

export default function DiscoverScreen() {
  const { play } = usePlayer();
  const { user } = useUser();
  const userId = user?.id ?? '';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DeezerTrack[]>([]);
  const [charts, setCharts] = useState<DeezerTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { getCharts(20).then(setCharts); }, []);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const found = await searchTracks(text);
      setResults(found);
      setLoading(false);
    }, 300);
  }, []);

  const handlePlay = async (track: DeezerTrack) => {
    await play(track);
    if (userId) await pushRecent(userId, track);
  };

  const handleLike = async (track: DeezerTrack) => {
    if (!userId) return;
    await toggleLike(userId, track);
    const liked = await isLiked(userId, track.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      liked ? next.add(track.id) : next.delete(track.id);
      return next;
    });
  };

  const displayList = query.length >= 2 ? results : charts;
  const showEmpty = query.length >= 2 && !loading && results.length === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search artists, tracks…"
            placeholderTextColor={Colors.textSecondary}
            value={query}
            onChangeText={handleSearch}
            autoCapitalize="none"
          />
        </View>
      </View>
      {loading && <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.md }} />}
      {showEmpty && <Text style={styles.empty}>No results for "{query}"</Text>}
      <FlatList
        data={displayList}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <SectionLabel>{query.length >= 2 ? 'RESULTS' : 'CHARTS'}</SectionLabel>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            onPlay={handlePlay}
            rank={query.length < 2 ? index + 1 : undefined}
            isLiked={likedIds.has(item.id)}
            onLike={handleLike}
            showLike
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: Colors.text, marginBottom: Spacing.md },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, marginBottom: Spacing.sm },
  searchIcon: { fontSize: 14, marginRight: Spacing.xs },
  searchInput: { flex: 1, padding: Spacing.sm, ...Typography.body, color: Colors.text },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  empty: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xl },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/(tabs)/discover.tsx
git commit -m "feat(screens): implement Discover screen with search and charts"
```

---

## Task 12: Library screen

**Files:**
- Create: `app/(tabs)/library.tsx`

- [ ] **Step 1: Implement Library screen**

Create `app/(tabs)/library.tsx`:
```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { TrackRow } from '../../src/components/track/TrackRow';
import { usePlayer } from '../../src/services/player';
import { getLiked, toggleLike, isLiked, pushRecent, type DeezerTrack } from '../../src/services/library';
import { Colors, Typography, Spacing, Radius } from '../../src/theme/tokens';
import { useFocusEffect } from 'expo-router';

const TABS = ['Liked', 'Recent'] as const;
type Tab = typeof TABS[number];

export default function LibraryScreen() {
  const { user } = useUser();
  const userId = user?.id ?? '';
  const { play } = usePlayer();
  const [activeTab, setActiveTab] = useState<Tab>('Liked');
  const [liked, setLiked] = useState<DeezerTrack[]>([]);
  const [recent, setRecent] = useState<DeezerTrack[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [l, r] = await Promise.all([
      getLiked(userId),
      import('../../src/services/library').then((m) => m.getRecent(userId)),
    ]);
    setLiked(l);
    setRecent(r);
  }, [userId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const handlePlay = async (track: DeezerTrack) => {
    await play(track);
    if (userId) await pushRecent(userId, track);
  };

  const handleLike = async (track: DeezerTrack) => {
    if (!userId) return;
    await toggleLike(userId, track);
    refresh();
  };

  const list = activeTab === 'Liked' ? liked : recent;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        <View style={styles.pills}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.pill, activeTab === tab && styles.pillActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.pillText, activeTab === tab && styles.pillTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {activeTab === 'Liked' ? 'Nothing liked yet. Tap ♥ on any track.' : 'No recently played tracks yet.'}
          </Text>
        }
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            onPlay={handlePlay}
            isLiked={activeTab === 'Liked' ? true : undefined}
            onLike={handleLike}
            showLike={activeTab === 'Liked'}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: Colors.text, marginBottom: Spacing.md },
  pills: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm },
  pill: { backgroundColor: Colors.surface, borderRadius: 999, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  pillActive: { backgroundColor: Colors.accent },
  pillText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  pillTextActive: { color: Colors.white },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  empty: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xl * 2 },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/(tabs)/library.tsx
git commit -m "feat(screens): implement Library screen with liked tracks and recent"
```

---

## Task 13: Profile screen

**Files:**
- Create: `app/(tabs)/profile.tsx`

- [ ] **Step 1: Implement Profile screen**

Create `app/(tabs)/profile.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useOta } from '../../src/contexts/OtaContext';
import Constants from 'expo-constants';
import { getLiked } from '../../src/services/library';
import { Colors, Typography, Spacing, Radius } from '../../src/theme/tokens';

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const { status: otaStatus } = useOta();
  const [likedCount, setLikedCount] = useState(0);

  useEffect(() => {
    if (user?.id) {
      getLiked(user.id).then((t) => setLikedCount(t.length));
    }
  }, [user?.id]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  const version = Constants.expoConfig?.version ?? '—';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatar}>
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={styles.avatarImg} />
          ) : (
            <View style={[styles.avatarImg, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{user?.firstName?.[0] ?? '?'}</Text>
            </View>
          )}
          <Text style={styles.name}>{user?.fullName ?? user?.firstName ?? 'Listener'}</Text>
          <Text style={styles.email}>{user?.primaryEmailAddress?.emailAddress ?? ''}</Text>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{likedCount}</Text>
            <Text style={styles.statLabel}>Liked</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>APP</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Version" value={`v${version}`} accent />
          <InfoRow label="OTA Status" value={otaStatus} />
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, accent && rowStyles.valueAccent]}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  label: { ...Typography.body, color: Colors.text },
  value: { ...Typography.body, color: Colors.textSecondary },
  valueAccent: { color: Colors.accent, fontWeight: '700' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  avatar: { alignItems: 'center', paddingTop: Spacing.xl, paddingBottom: Spacing.lg },
  avatarImg: { width: 72, height: 72, borderRadius: 36, marginBottom: Spacing.md },
  avatarFallback: { backgroundColor: Colors.muted, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 28, fontWeight: '700', color: Colors.text },
  name: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 3 },
  email: { ...Typography.caption, color: Colors.textSecondary },
  stats: { flexDirection: 'row', justifyContent: 'center', marginBottom: Spacing.lg },
  stat: { alignItems: 'center', paddingHorizontal: Spacing.xl },
  statNum: { fontSize: 22, fontWeight: '800', color: Colors.accent },
  statLabel: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  sectionLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.xs },
  infoCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg },
  signOutBtn: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  signOutText: { ...Typography.body, color: Colors.textSecondary },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/(tabs)/profile.tsx
git commit -m "feat(screens): implement Profile screen with Clerk user info and OTA status"
```

---

## Task 14: NowPlaying full screen

**Files:**
- Modify: `src/components/player/NowPlaying.tsx`

- [ ] **Step 1: Replace NowPlaying stub with full implementation**

Replace `src/components/player/NowPlaying.tsx`:
```tsx
import React from 'react';
import {
  Modal, View, Text, Image, TouchableOpacity, StyleSheet,
  Dimensions, PanResponder,
} from 'react-native';
import { usePlayer } from '../../services/player';
import { useUser } from '@clerk/clerk-expo';
import { toggleLike, isLiked as checkIsLiked } from '../../services/library';
import { Colors, Typography, Spacing, Radius } from '../../theme/tokens';
import { useState, useEffect } from 'react';

const { width } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function NowPlaying({ visible, onClose }: Props) {
  const { track, isPlaying, positionMs, durationMs, pause, resume, seek } = usePlayer();
  const { user } = useUser();
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (track && user?.id) {
      checkIsLiked(user.id, track.id).then(setLiked);
    }
  }, [track?.id, user?.id]);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
    onPanResponderRelease: (_, g) => { if (g.dy > 60) onClose(); },
  });

  const handleLike = async () => {
    if (!track || !user?.id) return;
    await toggleLike(user.id, track);
    setLiked((prev) => !prev);
  };

  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const scrubberWidth = width - Spacing.xl * 2;

  if (!track) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container} {...panResponder.panHandlers}>
        <View style={styles.handle} />

        <Image source={{ uri: track.album.cover_medium }} style={styles.art} />

        <View style={styles.info}>
          <Text style={styles.title}>{track.title}</Text>
          <Text style={styles.artist}>{track.artist.name}</Text>
          <Text style={styles.album}>{track.album.title}</Text>
        </View>

        {/* Scrubber */}
        <TouchableOpacity
          style={[styles.scrubberTrack, { width: scrubberWidth }]}
          onPress={(e) => {
            const tapX = e.nativeEvent.locationX;
            seek(Math.round((tapX / scrubberWidth) * durationMs));
          }}
          activeOpacity={1}
        >
          <View style={[styles.scrubberFill, { width: `${progress * 100}%` }]} />
          <View style={[styles.scrubberThumb, { left: `${progress * 100}%` }]} />
        </TouchableOpacity>
        <View style={styles.times}>
          <Text style={styles.time}>{formatMs(positionMs)}</Text>
          <Text style={styles.time}>{formatMs(durationMs)}</Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity onPress={handleLike} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[styles.action, liked && styles.actionActive]}>♥</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.playBtn}
            onPress={isPlaying ? pause : resume}
          >
            <Text style={styles.playBtnIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.action}>↓</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
  handle: { width: 36, height: 4, backgroundColor: Colors.muted, borderRadius: 2, marginBottom: Spacing.xl },
  art: { width: width * 0.72, height: width * 0.72, borderRadius: Radius.lg, backgroundColor: Colors.muted, shadowColor: Colors.accentDeep, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 8 },
  info: { alignItems: 'center', marginTop: Spacing.xl, marginBottom: Spacing.lg },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: Colors.text, textAlign: 'center' },
  artist: { ...Typography.body, color: Colors.textSecondary, marginTop: 4 },
  album: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  scrubberTrack: { height: 4, backgroundColor: Colors.muted, borderRadius: 2, overflow: 'visible', position: 'relative' },
  scrubberFill: { position: 'absolute', height: '100%', backgroundColor: Colors.accent, borderRadius: 2 },
  scrubberThumb: { position: 'absolute', top: -5, width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.accent, marginLeft: -7, shadowColor: Colors.accentDeep, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 3 },
  times: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: Spacing.xs },
  time: { ...Typography.caption, color: Colors.textMuted },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xl, marginTop: Spacing.xl },
  action: { fontSize: 24, color: Colors.muted },
  actionActive: { color: Colors.accent },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.accentDeep, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  playBtnIcon: { fontSize: 24, color: Colors.white },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/player/NowPlaying.tsx
git commit -m "feat(player): implement NowPlaying full-screen with scrubber, like, swipe-down"
```

---

## Task 15: Wire OTA/Config to Clerk user ID

**Files:**
- Modify: `src/hooks/useOtaUpdate.ts` — read `EXPO_PUBLIC_OTA_SERVER_URL`
- Modify: `App.tsx` → this file is no longer the entry point; delete it
- Modify: `app/(tabs)/_layout.tsx` — wire configClientRef (already stubbed in Task 9)

- [ ] **Step 1: Update useOtaUpdate to read env var**

In `src/hooks/useOtaUpdate.ts`, find the `buildConfig()` function. The `serverUrl` line currently reads:
```typescript
serverUrl: process.env.EXPO_PUBLIC_OTA_SERVER_URL ?? "",
```
This is already correct if the env var is present. Verify it reads from `EXPO_PUBLIC_OTA_SERVER_URL`. If it currently points to a hardcoded IP, update it:

Open `src/hooks/useOtaUpdate.ts`, find `buildConfig()`, ensure `serverUrl` is:
```typescript
serverUrl: process.env.EXPO_PUBLIC_OTA_SERVER_URL ?? '',
```

- [ ] **Step 2: Remove App.tsx**

```bash
rm "E:/Java WorkSpace/rumik-app/App.tsx"
```

expo-router's entry point (`expo-router/entry`) replaces App.tsx. The root layout is `app/_layout.tsx`.

- [ ] **Step 3: Add OTA server URL to .env.local**

Append to `.env.local`:
```
EXPO_PUBLIC_OTA_SERVER_URL=http://localhost:4000
```

For Android emulator use:
```
EXPO_PUBLIC_OTA_SERVER_URL=http://10.0.2.2:4000
```

- [ ] **Step 4: Type check**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOtaUpdate.ts
git rm App.tsx
git commit -m "feat(ota): read server URL from EXPO_PUBLIC_OTA_SERVER_URL env var, remove App.tsx"
```

---

## Task 16: Restyle UpdateBanner and run full test suite

**Files:**
- Modify: `src/components/UpdateBanner.tsx`

- [ ] **Step 1: Restyle UpdateBanner for light theme**

Open `src/components/UpdateBanner.tsx`. Replace any dark-mode color references with the Sand & Slate tokens. Key changes:
- Background: `Colors.surface` with `Colors.border` border
- Text: `Colors.text`
- Button: `Colors.accent` background with `Colors.white` text

The banner sits above MiniPlayer, shown when `otaStatus === 'available' || otaStatus === 'ready'`.

Replace the component body:
```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useOta } from '../contexts/OtaContext';
import { Colors, Typography, Spacing, Radius } from '../theme/tokens';

export function UpdateBanner() {
  const { status, download, applyNow } = useOta();
  if (status !== 'available' && status !== 'ready' && status !== 'downloading') return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {status === 'downloading' ? 'Downloading update…' : status === 'ready' ? 'Update ready to apply' : 'Update available'}
      </Text>
      {status === 'available' && (
        <TouchableOpacity style={styles.btn} onPress={download}>
          <Text style={styles.btnText}>Update</Text>
        </TouchableOpacity>
      )}
      {status === 'ready' && (
        <TouchableOpacity style={styles.btn} onPress={applyNow}>
          <Text style={styles.btnText}>Restart</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  text: { ...Typography.caption, color: Colors.text, flex: 1 },
  btn: { backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  btnText: { ...Typography.label, color: Colors.white },
});
```

- [ ] **Step 2: Run full test suite**

```bash
cd "E:/Java WorkSpace/rumik-app"
npm test
```
Expected: all existing tests pass (theme, TrackRow, Pill, deezer, library, player + existing OTA/config tests).

- [ ] **Step 3: Commit**

```bash
git add src/components/UpdateBanner.tsx
git commit -m "feat(ui): restyle UpdateBanner for Sand & Slate light theme"
```

---

## Task 17: Update DESIGN.md and push

**Files:**
- Modify: `DESIGN.md`
- Modify: `docs/superpowers/specs/2026-05-20-rumik-app-redesign.md` (mark implemented)

- [ ] **Step 1: Update DESIGN.md color tokens**

In `DESIGN.md`, update the colors section to reflect the new Sand & Slate palette. Replace the existing colors block with:

```yaml
colors:
  bg: "#f5f2ed"
  surface: "#ede8e0"
  muted: "#d8d0c4"
  accent: "#3d5a6e"
  accent-deep: "#2d4a5e"
  text: "#18202a"
  text-secondary: "#8a8070"
  text-muted: "#b0a898"
  border: "#e8e2d8"
  white: "#fdfcfa"
theme: light
```

- [ ] **Step 2: Final type check**

```bash
pnpm typecheck
```
Expected: zero errors.

- [ ] **Step 3: Final test run**

```bash
npm test -- --coverage
```
Expected: all tests pass, coverage ≥70% on new service files.

- [ ] **Step 4: Commit and push**

```bash
git add DESIGN.md docs/
git commit -m "docs: update DESIGN.md to Sand & Slate light theme tokens"
git push origin master
```

---

## Summary

| Task | Deliverable |
|---|---|
| 1 | expo-router + Clerk + expo-av installed |
| 2 | Design tokens (`src/theme/tokens.ts`) |
| 3 | SectionLabel + Pill UI components |
| 4 | TrackRow component + DeezerTrack type |
| 5 | Deezer API service (charts, search) |
| 6 | Library persistence (liked, recent) |
| 7 | AudioPlayer context (expo-av) |
| 8 | Clerk sign-in + sign-up screens |
| 9 | Tab layout + MiniPlayer + auth guard |
| 10 | Home screen |
| 11 | Discover screen |
| 12 | Library screen |
| 13 | Profile screen |
| 14 | NowPlaying full-screen modal |
| 15 | OTA env var + remove App.tsx |
| 16 | UpdateBanner restyled + full test run |
| 17 | DESIGN.md updated + push |
