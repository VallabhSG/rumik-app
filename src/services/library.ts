import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DeezerTrack } from "./deezer";

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

export async function toggleLike(
  userId: string,
  track: DeezerTrack,
): Promise<boolean> {
  const liked = await getLiked(userId);
  const idx = liked.findIndex((t) => t.id === track.id);
  if (idx >= 0) {
    const updated = [...liked.slice(0, idx), ...liked.slice(idx + 1)];
    await writeJSON(likedKey(userId), updated);
    return false;
  }
  await writeJSON(likedKey(userId), [track, ...liked]);
  return true;
}

export async function isLiked(
  userId: string,
  trackId: number,
): Promise<boolean> {
  const liked = await getLiked(userId);
  return liked.some((t) => t.id === trackId);
}

export async function pushRecent(
  userId: string,
  track: DeezerTrack,
): Promise<void> {
  const recent = await readJSON<DeezerTrack[]>(recentKey(userId), []);
  const filtered = recent.filter((t) => t.id !== track.id);
  await writeJSON(recentKey(userId), [track, ...filtered].slice(0, 20));
}

export async function getRecent(userId: string): Promise<DeezerTrack[]> {
  return readJSON<DeezerTrack[]>(recentKey(userId), []);
}
