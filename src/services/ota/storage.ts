import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LaunchRecord } from "./types";

const KEYS = {
  INSTALL_ID: "ota:install_id",
  SESSION_OPEN: "ota:session_open", // written at launch, cleared on graceful exit
  CURRENT_VERSION: "ota:current_version",
  PREVIOUS_VERSION: "ota:previous_version",
  LAUNCH_RECORDS: "ota:launch_records", // Record<version, LaunchRecord>
} as const;

interface SessionMark {
  version: string;
  at: string;
}

export const storage = {
  // Install ID — stable identifier for rollout bucketing
  getInstallId: () => AsyncStorage.getItem(KEYS.INSTALL_ID),
  setInstallId: (id: string) => AsyncStorage.setItem(KEYS.INSTALL_ID, id),

  // Session watchdog — detects ungraceful shutdowns (crashes)
  markSessionOpen: (version: string) =>
    AsyncStorage.setItem(
      KEYS.SESSION_OPEN,
      JSON.stringify({
        version,
        at: new Date().toISOString(),
      } satisfies SessionMark),
    ),
  clearSessionOpen: () => AsyncStorage.removeItem(KEYS.SESSION_OPEN),
  getSessionOpen: async (): Promise<SessionMark | null> => {
    const raw = await AsyncStorage.getItem(KEYS.SESSION_OPEN);
    return raw ? (JSON.parse(raw) as SessionMark) : null;
  },

  // Current / previous bundle version for rollback bookkeeping
  getCurrentVersion: () => AsyncStorage.getItem(KEYS.CURRENT_VERSION),
  setCurrentVersion: (v: string) =>
    AsyncStorage.setItem(KEYS.CURRENT_VERSION, v),
  getPreviousVersion: () => AsyncStorage.getItem(KEYS.PREVIOUS_VERSION),
  setPreviousVersion: (v: string) =>
    AsyncStorage.setItem(KEYS.PREVIOUS_VERSION, v),

  // Per-version launch / crash counters
  getLaunchRecords: async (): Promise<Record<string, LaunchRecord>> => {
    const raw = await AsyncStorage.getItem(KEYS.LAUNCH_RECORDS);
    return raw ? (JSON.parse(raw) as Record<string, LaunchRecord>) : {};
  },
  setLaunchRecords: (records: Record<string, LaunchRecord>) =>
    AsyncStorage.setItem(KEYS.LAUNCH_RECORDS, JSON.stringify(records)),
};
