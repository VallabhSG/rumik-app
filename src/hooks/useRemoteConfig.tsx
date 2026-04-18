import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { Platform } from "react-native";
import * as Application from "expo-application";
import { ConfigClient } from "../services/config/ConfigClient";
import { getInstallId } from "../services/ota/deviceId";
import type { ConfigClientOptions } from "../services/config/types";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ConfigClientContext = createContext<ConfigClient | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface RemoteConfigProviderProps {
  serverUrl: string;
  apiKey: string;
  children: React.ReactNode;
}

export function RemoteConfigProvider({
  serverUrl,
  apiKey,
  children,
}: RemoteConfigProviderProps) {
  const clientRef = useRef<ConfigClient | null>(null);

  if (!clientRef.current) {
    // Build options synchronously with best-effort installId
    // (getInstallId is async — we seed with a temp value and let initialize() overwrite)
    const options: ConfigClientOptions = {
      serverUrl,
      apiKey,
      platform: Platform.OS as "ios" | "android" | "web",
      nativeVersion: Application.nativeApplicationVersion ?? "1.0.0",
      installId: "pending",
    };
    clientRef.current = new ConfigClient(options);
  }

  useEffect(() => {
    const client = clientRef.current!;

    // Resolve the installId before initializing
    getInstallId()
      .then((id) => {
        // Patch the installId now that it's available, then initialize
        // @ts-expect-error — patching private field in effect only
        (
          client as unknown as { options: ConfigClientOptions }
        ).options.installId = id;
        return client.initialize();
      })
      .catch(() => client.initialize());

    return () => client.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ConfigClientContext.Provider value={clientRef.current}>
      {children}
    </ConfigClientContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Internal hook — returns the client from context
// ---------------------------------------------------------------------------

export function useRemoteConfigClient(): ConfigClient {
  const client = useContext(ConfigClientContext);
  if (!client) {
    throw new Error(
      "useRemoteConfigClient must be used inside <RemoteConfigProvider>",
    );
  }
  return client;
}

// ---------------------------------------------------------------------------
// Subscribe helper — bridges ConfigClient listeners to useSyncExternalStore
// ---------------------------------------------------------------------------

function useConfigSnapshot<T>(
  client: ConfigClient,
  selector: (client: ConfigClient) => T,
): T {
  return useSyncExternalStore(
    (onStoreChange) => client.subscribe(onStoreChange),
    () => selector(client),
    () => selector(client),
  );
}

// ---------------------------------------------------------------------------
// Public hooks
// ---------------------------------------------------------------------------

export function useFeatureFlag(key: string, defaultValue = false): boolean {
  const client = useRemoteConfigClient();
  return useConfigSnapshot(client, (c) => c.getFlag(key, defaultValue));
}

export function useExperiment(key: string, defaultVariant: string): string {
  const client = useRemoteConfigClient();
  return useConfigSnapshot(client, (c) => c.getExperiment(key, defaultVariant));
}

export function useKillSwitch(key: string): boolean {
  const client = useRemoteConfigClient();
  return useConfigSnapshot(client, (c) => c.isKillSwitchActive(key));
}

export function useDynamicUrl(key: string, defaultUrl: string): string {
  const client = useRemoteConfigClient();
  return useConfigSnapshot(client, (c) => c.getUrl(key, defaultUrl));
}
