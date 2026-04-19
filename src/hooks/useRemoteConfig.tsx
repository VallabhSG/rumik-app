import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
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
  const [client] = useState<ConfigClient>(() => {
    const options: ConfigClientOptions = {
      serverUrl,
      apiKey,
      platform: Platform.OS as "ios" | "android" | "web",
      nativeVersion: Application.nativeApplicationVersion ?? "1.0.0",
      installId: "pending",
    };
    return new ConfigClient(options);
  });

  // Keep a ref for the effect cleanup — safe to access in effects/handlers
  const clientRef = useRef(client);

  useEffect(() => {
    // Resolve the installId before initializing
    getInstallId()
      .then((id) => {
        (
          clientRef.current as unknown as { options: ConfigClientOptions }
        ).options.installId = id;
        return clientRef.current.initialize();
      })
      .catch(() => clientRef.current.initialize());

    const currentClient = clientRef.current;
    return () => currentClient.destroy();
  }, []);

  return (
    <ConfigClientContext.Provider value={client}>
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
