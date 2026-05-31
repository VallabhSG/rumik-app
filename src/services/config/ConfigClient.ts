import { Platform } from "react-native";
import { configStorage } from "./storage";
import { WsClient } from "./wsClient";
import type {
  RemoteConfig,
  ConfigClientOptions,
  ConfigStatus,
  UserContext,
} from "./types";

const EMPTY_CONFIG: RemoteConfig = {
  flags: {},
  experiments: {},
  urls: {},
  kill_switches: {},
  ttl: 300,
  version: "",
};

/**
 * ConfigClient — orchestrates the full remote config lifecycle.
 *
 * Responsibilities:
 *  1. On initialize(): load cached config immediately (serve stale-while-revalidate),
 *     then fetch fresh config in background.
 *  2. On fresh fetch: compare version hash, update cache and notify listeners if changed.
 *  3. On fetch failure: keep serving cache, set status to 'stale'.
 *  4. Set TTL timer to auto-refresh.
 *  5. On native: open WebSocket for live kill switch events.
 *
 * Call order:
 *   client.initialize()         ← call once at app start
 *   client.getFlag(key, def)    ← call anytime after initialize
 *   client.destroy()            ← call on unmount
 */
export class ConfigClient {
  private options: ConfigClientOptions;
  private config: RemoteConfig = { ...EMPTY_CONFIG };
  private status: ConfigStatus = "loading";
  private listeners = new Set<() => void>();
  private ttlTimer: ReturnType<typeof setTimeout> | null = null;
  private ws: WsClient | null = null;
  private userContext: UserContext = {};

  constructor(options: ConfigClientOptions) {
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    // 1. Serve from cache immediately
    const cached = await configStorage.getCache();
    if (cached) {
      this.config = cached.config;
      this.status = "ready";
      this.notifyListeners();
    }

    // 2. Fetch fresh in background (don't await — never block the caller)
    void this.fetchAndUpdate();

    // 3. Open WebSocket on native
    if (Platform.OS !== "web" && this.options.serverUrl) {
      const wsUrl = this.options.serverUrl
        .replace(/^https:/, "wss:")
        .replace(/^http:/, "ws:");
      this.ws = new WsClient(`${wsUrl}/ws`, this.options.apiKey, (msg) => {
        if (
          msg.type === "kill_switch" &&
          msg.key !== undefined &&
          msg.active !== undefined
        ) {
          this.config = {
            ...this.config,
            kill_switches: {
              ...this.config.kill_switches,
              [msg.key]: msg.active,
            },
          };
          this.options.onKillSwitch?.(msg.key, msg.active);
          this.notifyListeners();
        }
      });
      this.ws.connect();
    }
  }

  destroy(): void {
    this.ws?.disconnect();
    this.ws = null;
    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer);
      this.ttlTimer = null;
    }
    this.listeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  getFlag(key: string, defaultValue = false): boolean {
    return this.config.flags[key] ?? defaultValue;
  }

  getExperiment(key: string, defaultVariant: string): string {
    return this.config.experiments[key] ?? defaultVariant;
  }

  getUrl(key: string, defaultUrl: string): string {
    return this.config.urls[key] ?? defaultUrl;
  }

  isKillSwitchActive(key: string): boolean {
    return this.config.kill_switches[key] ?? false;
  }

  getStatus(): ConfigStatus {
    return this.status;
  }

  /**
   * Subscribe to config changes. Returns an unsubscribe function.
   * Called whenever the config is updated (fetch or WebSocket).
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Set the install ID before initialize() is called. Avoids unsafe private-field mutation from the outside. */
  setInstallId(id: string): void {
    this.options.installId = id;
  }

  /** Set user context for targeted config delivery. Call before or after initialize(). */
  setUserContext(ctx: UserContext): void {
    this.userContext = ctx;
  }

  /** Force a re-fetch from the server. */
  async refresh(): Promise<void> {
    await this.fetchAndUpdate();
  }

  async trackExposure(
    experimentKey: string,
    body: { install_id: string; variant_id: string; user_id?: string },
  ): Promise<void> {
    if (!this.options.serverUrl) return;
    try {
      await fetch(
        `${this.options.serverUrl}/api/experiments/${experimentKey}/expose`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    } catch {
      // best-effort — tracking must not affect the caller
    }
  }

  async trackConversion(
    experimentKey: string,
    body: {
      install_id: string;
      variant_id: string;
      event_name: string;
      value?: number;
      user_id?: string;
    },
  ): Promise<void> {
    if (!this.options.serverUrl) return;
    try {
      await fetch(
        `${this.options.serverUrl}/api/experiments/${experimentKey}/convert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    } catch {
      // best-effort — tracking must not affect the caller
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async fetchAndUpdate(): Promise<void> {
    if (!this.options.serverUrl) return;

    try {
      const params = new URLSearchParams({
        platform: this.options.platform,
        native_version: this.options.nativeVersion,
        install_id: this.options.installId,
      });
      if (this.userContext.userId)
        params.set("user_id", this.userContext.userId);
      if (this.userContext.plan) params.set("plan", this.userContext.plan);
      if (this.userContext.email_domain)
        params.set("email_domain", this.userContext.email_domain);
      if (this.userContext.account_age_days !== undefined) {
        params.set(
          "account_age_days",
          String(this.userContext.account_age_days),
        );
      }

      const res = await fetch(
        `${this.options.serverUrl}/api/config?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!res.ok) throw new Error(`Config server responded ${res.status}`);

      const body = (await res.json()) as {
        success: boolean;
        data: RemoteConfig;
      };
      const fresh = body.data;

      // Only update and notify if content actually changed
      if (fresh.version !== this.config.version) {
        this.config = fresh;
        this.options.onConfigUpdate?.(fresh);
        await configStorage.setCache(fresh);
        this.notifyListeners();
      }

      this.status = "ready";
      this.scheduleTtlRefresh(fresh.ttl);
    } catch (err) {
      console.warn("[Config] fetch failed:", err);
      this.status = this.config.version ? "stale" : "error";
      this.notifyListeners();
      // Retry after 60s on error
      this.scheduleTtlRefresh(60);
    }
  }

  private scheduleTtlRefresh(ttlSeconds: number): void {
    if (this.ttlTimer) clearTimeout(this.ttlTimer);
    // Server-provided TTL takes precedence; fall back to client option
    const effectiveTtl = ttlSeconds ?? this.options.ttl;
    this.ttlTimer = setTimeout(
      () => void this.fetchAndUpdate(),
      effectiveTtl * 1_000,
    );
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
