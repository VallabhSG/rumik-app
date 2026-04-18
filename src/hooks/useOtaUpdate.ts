import { useState, useEffect, useCallback, useRef } from "react";
import { Platform } from "react-native";
import * as Application from "expo-application";
import { OtaClient } from "../services/ota/OtaClient";
import type { OtaConfig, UpdateStatus } from "../services/ota/types";

function buildConfig(): OtaConfig {
  return {
    serverUrl: process.env.EXPO_PUBLIC_OTA_SERVER_URL ?? "",
    apiKey: process.env.EXPO_PUBLIC_OTA_API_KEY ?? "",
    channel: process.env.EXPO_PUBLIC_OTA_CHANNEL ?? "production",
    platform: Platform.OS as "ios" | "android",
    nativeVersion: Application.nativeApplicationVersion ?? "1.0.0",
    crashThreshold: 0.5, // 50% crash rate → auto-rollback
    minLaunchesBeforeRollback: 3, // evaluate only after ≥3 launches
  };
}

interface OtaUpdateState {
  /** Current phase of the update lifecycle */
  status: UpdateStatus;
  /** Non-null when status === 'error' */
  error: string | null;
  /** Trigger a download. Call when status === 'available'. */
  download: () => Promise<void>;
  /** Restart the app and apply the staged update. Call when status === 'ready'. */
  applyNow: () => Promise<void>;
}

/**
 * useOtaUpdate
 *
 * Initializes the OTA client on mount, runs a background update check, and
 * exposes the current status so the UI can react.
 *
 * Typical flow:
 *   idle → checking → available → downloading → ready
 *                  └→ up-to-date (no update)
 *                  └→ not-in-rollout (device outside rollout %)
 *
 * Crash-safe rollback is automatic: if the crash rate on the running version
 * exceeds the configured threshold, the app reloads and expo-updates falls
 * back to the previous cached bundle.
 *
 * Only runs on native (iOS/Android). On web, stays in 'idle' forever.
 *
 * @example
 * function UpdateBanner() {
 *   const { status, download, applyNow } = useOtaUpdate();
 *   if (status === 'available') return <Button onPress={download} title="Update available" />;
 *   if (status === 'ready')     return <Button onPress={applyNow} title="Restart to apply" />;
 *   return null;
 * }
 */
export function useOtaUpdate(): OtaUpdateState {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<OtaClient | null>(null);

  useEffect(() => {
    // OTA updates only make sense on native platforms
    if (Platform.OS === "web") return;

    const config = buildConfig();
    if (!config.serverUrl) return; // not configured in this environment

    const client = new OtaClient(config, (s) => {
      setStatus(s);
      if (s !== "error") setError(null);
    });
    clientRef.current = client;

    client
      .initialize()
      .then(() => client.checkForUpdate())
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : "OTA initialization failed";
        setError(msg);
        setStatus("error");
      });

    return () => {
      client.destroy();
      clientRef.current = null;
    };
  }, []);

  const download = useCallback(async () => {
    try {
      await clientRef.current?.downloadAndStage();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
      setStatus("error");
    }
  }, []);

  const applyNow = useCallback(async () => {
    await clientRef.current?.applyNow();
  }, []);

  return { status, error, download, applyNow };
}
