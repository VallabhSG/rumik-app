import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DeezerTrack } from "./deezer";

const OFFLINE_DIR = `${FileSystem.documentDirectory}offline/`;
const STORAGE_KEY = "offline:tracks";

interface OfflineMeta {
  id: number;
  title: string;
  artist: string;
  cover: string;
  localUri: string;
  downloadedAt: string;
}

function localUri(trackId: number): string {
  return `${OFFLINE_DIR}${trackId}.mp3`;
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(OFFLINE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(OFFLINE_DIR, { intermediates: true });
  }
}

async function loadMeta(): Promise<Record<number, OfflineMeta>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<number, OfflineMeta>) : {};
  } catch {
    return {};
  }
}

async function saveMeta(meta: Record<number, OfflineMeta>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}

export async function downloadTrack(
  track: DeezerTrack,
  onProgress?: (progress: number) => void,
): Promise<void> {
  await ensureDir();
  const uri = localUri(track.id);

  const dl = FileSystem.createDownloadResumable(
    track.preview,
    uri,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (totalBytesExpectedToWrite > 0) {
        onProgress?.(totalBytesWritten / totalBytesExpectedToWrite);
      }
    },
  );

  await dl.downloadAsync();

  const meta = await loadMeta();
  meta[track.id] = {
    id: track.id,
    title: track.title,
    artist: track.artist.name,
    cover: track.album.cover_medium,
    localUri: uri,
    downloadedAt: new Date().toISOString(),
  };
  await saveMeta(meta);
}

export async function isDownloaded(trackId: number): Promise<boolean> {
  const meta = await loadMeta();
  if (!meta[trackId]) return false;
  const info = await FileSystem.getInfoAsync(meta[trackId].localUri);
  return info.exists;
}

export async function getLocalUri(trackId: number): Promise<string | null> {
  const meta = await loadMeta();
  if (!meta[trackId]) return null;
  const info = await FileSystem.getInfoAsync(meta[trackId].localUri);
  return info.exists ? meta[trackId].localUri : null;
}

export async function removeDownload(trackId: number): Promise<void> {
  const meta = await loadMeta();
  if (!meta[trackId]) return;
  await FileSystem.deleteAsync(meta[trackId].localUri, { idempotent: true });
  delete meta[trackId];
  await saveMeta(meta);
}

export async function getAllDownloads(): Promise<OfflineMeta[]> {
  const meta = await loadMeta();
  return Object.values(meta);
}
