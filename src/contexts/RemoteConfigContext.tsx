import React, { createContext, useCallback, useContext, useRef, useSyncExternalStore } from "react";
import { useRemoteConfigClient } from "../hooks/useRemoteConfig";
import type { ConfigPayload, ExperimentAssignment, UserContext } from "../services/config/types";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface RemoteConfigContextValue {
  config: ConfigPayload;
  isLoading: boolean;
  setUserContext: (ctx: UserContext) => void;
}

const defaultConfig: ConfigPayload = {
  flags: {},
  remote_urls: {},
  experiments: {},
  kill_switches: [],
};

const RemoteConfigContext = createContext<RemoteConfigContextValue>({
  config: defaultConfig,
  isLoading: true,
  setUserContext: () => {},
});

// ---------------------------------------------------------------------------
// Helper — map RemoteConfig → ConfigPayload
// ---------------------------------------------------------------------------

function toConfigPayload(client: ReturnType<typeof useRemoteConfigClient>): ConfigPayload {
  // The underlying RemoteConfig uses:
  //   experiments: Record<string, string>  (variant id strings)
  //   urls: Record<string, string>
  //   kill_switches: Record<string, boolean>
  //   flags: Record<string, boolean>
  //
  // ConfigPayload uses:
  //   experiments: Record<string, ExperimentAssignment>
  //   remote_urls: Record<string, string>
  //   kill_switches: string[]  (only the active ones)
  //   flags: Record<string, boolean>

  const raw = (client as unknown as { config: { flags: Record<string, boolean>; experiments: Record<string, string>; urls: Record<string, string>; kill_switches: Record<string, boolean> } }).config;

  // Build ExperimentAssignment map from flat string experiments
  const experiments: Record<string, ExperimentAssignment> = {};
  for (const [key, variant_id] of Object.entries(raw?.experiments ?? {})) {
    experiments[key] = { variant_id, experiment_key: key };
  }

  // Only include active kill switches as a string array
  const kill_switches: string[] = Object.entries(raw?.kill_switches ?? {})
    .filter(([, active]) => active)
    .map(([key]) => key);

  return {
    flags: raw?.flags ?? {},
    remote_urls: raw?.urls ?? {},
    experiments,
    kill_switches,
  };
}

// ---------------------------------------------------------------------------
// Provider — wraps the existing ConfigClientContext
// ---------------------------------------------------------------------------

export function RemoteConfigPayloadProvider({ children }: { children: React.ReactNode }) {
  const client = useRemoteConfigClient();

  // useSyncExternalStore requires getSnapshot to return a stable reference when
  // the store hasn't changed. toConfigPayload always constructs a new object, so
  // we cache the last raw config reference and only recompute when it changes.
  const lastRawRef = useRef<object | null>(null);
  const lastPayloadRef = useRef<ConfigPayload>(defaultConfig);

  const getSnapshot = useCallback((): ConfigPayload => {
    const raw = (client as unknown as { config: object }).config;
    if (raw !== null && raw === lastRawRef.current) {
      return lastPayloadRef.current;
    }
    lastRawRef.current = raw;
    lastPayloadRef.current = toConfigPayload(client);
    return lastPayloadRef.current;
  }, [client]);

  const config = useSyncExternalStore(
    (onStoreChange) => client.subscribe(onStoreChange),
    getSnapshot,
    () => defaultConfig,
  );

  const isLoading = client.getStatus() === "loading";

  const setUserContext = useCallback(
    (ctx: UserContext) => {
      client.setUserContext(ctx);
      void client.refresh();
    },
    [client],
  );

  return (
    <RemoteConfigContext.Provider value={{ config, isLoading, setUserContext }}>
      {children}
    </RemoteConfigContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useRemoteConfig(): RemoteConfigContextValue {
  return useContext(RemoteConfigContext);
}

export function useFlag(key: string): boolean {
  const { config } = useContext(RemoteConfigContext);
  return config.flags[key] ?? false;
}

export function useExperimentVariant(key: string): string | null {
  const { config } = useContext(RemoteConfigContext);
  return config.experiments[key]?.variant_id ?? null;
}
