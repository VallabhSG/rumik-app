export interface RemoteConfig {
  flags: Record<string, boolean>;
  experiments: Record<string, string>;
  urls: Record<string, string>;
  kill_switches: Record<string, boolean>;
  ttl: number;
  version: string;
}

export interface ConfigClientOptions {
  serverUrl: string;
  apiKey: string;
  platform: "ios" | "android" | "web";
  nativeVersion: string;
  installId: string;
  /** Override server TTL (seconds). Defaults to whatever the server returns. */
  ttl?: number;
  /** Called on WebSocket kill switch events — before React re-render. */
  onKillSwitch?: (key: string, active: boolean) => void;
  /** Called whenever the cached config is updated. */
  onConfigUpdate?: (config: RemoteConfig) => void;
}

export type ConfigStatus = "loading" | "ready" | "error" | "stale";

export interface UserContext {
  userId?: string;
  plan?: string;
  email_domain?: string;
  account_age_days?: number;
}

export interface WsMessage {
  type: "authenticated" | "kill_switch" | "ping";
  key?: string;
  active?: boolean;
  reason?: string | null;
}

export interface ExperimentAssignment {
  variant_id: string;
  experiment_key: string;
}

export interface ConfigPayload {
  flags: Record<string, boolean>;
  remote_urls: Record<string, string>;
  experiments: Record<string, ExperimentAssignment>;
  kill_switches: string[];
}
