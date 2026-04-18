import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RemoteConfig } from "./types";

const KEYS = {
  CONFIG_CACHE: "config:cache",
  CACHE_TIMESTAMP: "config:cached_at",
} as const;

export const configStorage = {
  getCache: async (): Promise<{
    config: RemoteConfig;
    cachedAt: Date;
  } | null> => {
    try {
      const [raw, ts] = await Promise.all([
        AsyncStorage.getItem(KEYS.CONFIG_CACHE),
        AsyncStorage.getItem(KEYS.CACHE_TIMESTAMP),
      ]);
      if (!raw || !ts) return null;
      return {
        config: JSON.parse(raw) as RemoteConfig,
        cachedAt: new Date(ts),
      };
    } catch {
      return null;
    }
  },

  setCache: async (config: RemoteConfig): Promise<void> => {
    try {
      await Promise.all([
        AsyncStorage.setItem(KEYS.CONFIG_CACHE, JSON.stringify(config)),
        AsyncStorage.setItem(KEYS.CACHE_TIMESTAMP, new Date().toISOString()),
      ]);
    } catch {
      // Non-fatal — serve from in-memory copy if storage unavailable
    }
  },

  clearCache: async (): Promise<void> => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(KEYS.CONFIG_CACHE),
        AsyncStorage.removeItem(KEYS.CACHE_TIMESTAMP),
      ]);
    } catch {
      // Ignore
    }
  },
};
