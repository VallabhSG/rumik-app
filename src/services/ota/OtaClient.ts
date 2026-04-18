import * as Updates from "expo-updates";
import * as Application from "expo-application";
import type { OtaConfig, OtaRelease, UpdateStatus } from "./types";
import { storage } from "./storage";
import { getInstallId } from "./deviceId";
import { isInRollout } from "./rollout";
import { CrashTracker } from "./crashTracker";

type StatusCallback = (status: UpdateStatus) => void;

/**
 * OtaClient — orchestrates the full update lifecycle.
 *
 * Responsibilities:
 *  1. Check our control-plane server for a release eligible for this device
 *     (platform, native version constraints, rollout %).
 *  2. If eligible, delegate bundle download to expo-updates (which talks to
 *     EAS CDN; expo-updates also verifies code-signing on the bundle).
 *  3. Stage the update: persist version bookkeeping so crash-safe rollback
 *     can restore the previous bundle on next launch.
 *  4. On launch: run crash detection and auto-rollback if crash rate is
 *     above the configured threshold.
 *
 * Call order:
 *   client.initialize()           ← call once at app start (before any UI)
 *   client.checkForUpdate()       ← call after initialize, or on demand
 *   client.downloadAndStage()     ← call when status === 'available'
 *   client.applyNow()             ← call when status === 'ready' (reloads app)
 */
export class OtaClient {
  private config: OtaConfig;
  private onStatus: StatusCallback;
  private crashTracker: CrashTracker | null = null;

  constructor(config: OtaConfig, onStatus: StatusCallback) {
    this.config = config;
    this.onStatus = onStatus;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Must be called at app start before anything else.
   * Sets up the crash tracker and checks whether the previous session crashed.
   * If crash rate exceeds the threshold, triggers an auto-rollback.
   */
  async initialize(): Promise<void> {
    console.log("[OTA] initialize start");
    const version = await this.resolveCurrentVersion();
    console.log("[OTA] resolved version:", version);

    this.crashTracker = new CrashTracker(
      version,
      this.handleCrashThresholdExceeded,
      this.config.crashThreshold,
      this.config.minLaunchesBeforeRollback,
    );

    try {
      await this.crashTracker.initialize();
      console.log("[OTA] crashTracker initialized");
      await this.crashTracker.recordLaunch();
      console.log("[OTA] launch recorded");
    } catch (e) {
      console.warn("[OTA] crashTracker init failed (non-fatal):", e);
    }
    console.log("[OTA] initialize done");
  }

  destroy(): void {
    this.crashTracker?.destroy();
  }

  // ---------------------------------------------------------------------------
  // Update flow
  // ---------------------------------------------------------------------------

  /**
   * Phase 1 — Check.
   * Asks the control-plane server whether a release exists for this device.
   * Performs rollout bucketing locally so that devices outside the rollout
   * do not receive the update.
   *
   * Returns the new status.
   */
  async checkForUpdate(): Promise<UpdateStatus> {
    this.onStatus("checking");

    try {
      const [installId, nativeVersion] = await Promise.all([
        getInstallId(),
        Promise.resolve(
          Application.nativeApplicationVersion ?? this.config.nativeVersion,
        ),
      ]);

      const release = await this.fetchCurrentRelease(nativeVersion);
      if (!release) {
        this.onStatus("up-to-date");
        return "up-to-date";
      }

      // Rollout gate — deterministic per device × release
      if (!isInRollout(installId, release.id, release.rollout_percentage)) {
        this.onStatus("not-in-rollout");
        return "not-in-rollout";
      }

      // Already on this version?
      const current = await this.resolveCurrentVersion();
      if (current === release.version) {
        this.onStatus("up-to-date");
        return "up-to-date";
      }

      this.onStatus("available");
      return "available";
    } catch (err) {
      console.error("[OTA] checkForUpdate error:", err);
      this.onStatus("error");
      return "error";
    }
  }

  /**
   * Phase 2 — Download.
   * Uses expo-updates to fetch the bundle from EAS CDN in the background.
   * expo-updates validates the bundle signature before writing it to disk.
   * The update is NOT applied yet — it will be applied on the next restart.
   *
   * Persists previous / next version for crash-safe rollback bookkeeping.
   */
  async downloadAndStage(): Promise<UpdateStatus> {
    this.onStatus("downloading");

    try {
      let expoUpdatesAvailable = false;
      try {
        const check = await Updates.checkForUpdateAsync();
        expoUpdatesAvailable = check.isAvailable;
      } catch (expoErr) {
        const msg = expoErr instanceof Error ? expoErr.message : "";
        if (msg.includes("not accessible in Expo Go")) {
          // In Expo Go expo-updates download is disabled — skip to ready so the
          // full UI flow (available → downloading → ready) can be observed.
          console.warn("[OTA] Expo Go: skipping actual bundle download");
          this.onStatus("ready");
          return "ready";
        }
        throw expoErr;
      }

      if (!expoUpdatesAvailable) {
        this.onStatus("up-to-date");
        return "up-to-date";
      }

      // Background download — expo-updates writes to its own cache directory.
      // Bundle signature verification happens inside fetchUpdateAsync.
      await Updates.fetchUpdateAsync();

      // Bookkeeping for crash-safe rollback
      const prev = await this.resolveCurrentVersion();
      const nativeVersion =
        Application.nativeApplicationVersion ?? this.config.nativeVersion;
      const release = await this.fetchCurrentRelease(nativeVersion);
      if (release) {
        await storage.setPreviousVersion(prev);
        await storage.setCurrentVersion(release.version);
      }

      this.onStatus("ready");
      return "ready";
    } catch (err) {
      console.error("[OTA] downloadAndStage error:", err);
      this.onStatus("error");
      return "error";
    }
  }

  /**
   * Phase 3 — Apply.
   * Reloads the app. On next start, expo-updates will load the staged bundle.
   * Only call this from a user-visible action or when backgrounded — never
   * interrupt active user sessions.
   */
  async applyNow(): Promise<void> {
    await Updates.reloadAsync();
  }

  // ---------------------------------------------------------------------------
  // Crash-safe rollback
  // ---------------------------------------------------------------------------

  private handleCrashThresholdExceeded = async (
    version: string,
    crashRate: number,
  ): Promise<void> => {
    console.warn(
      `[OTA] Crash rate ${(crashRate * 100).toFixed(0)}% on v${version} — triggering rollback`,
    );

    // Report crash rate to the OTA server (best-effort)
    void this.reportCrashRate(version, crashRate);

    // Register the rollback on the control-plane server (best-effort)
    const previousVersion = await storage.getPreviousVersion();
    void this.registerRollback(version, previousVersion, crashRate);

    // Reload: expo-updates will fall back to the previously cached bundle
    await Updates.reloadAsync();
  };

  private async reportCrashRate(
    version: string,
    crashRate: number,
  ): Promise<void> {
    try {
      await fetch(`${this.config.serverUrl}/api/crash-rate`, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({
          crash_rate: crashRate,
          version,
          channel: this.config.channel,
        }),
      });
    } catch {
      // ignore — best-effort
    }
  }

  private async registerRollback(
    fromVersion: string,
    targetVersion: string | null,
    crashRate: number,
  ): Promise<void> {
    try {
      await fetch(`${this.config.serverUrl}/api/rollbacks`, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({
          target_version: targetVersion ?? "unknown",
          reason: `Auto-rollback: crash rate ${(crashRate * 100).toFixed(0)}% on v${fromVersion}`,
          channels: this.config.channel,
          triggered_by: "client-crash-detector",
        }),
      });
    } catch {
      // ignore — best-effort
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async fetchCurrentRelease(
    nativeVersion: string,
  ): Promise<OtaRelease | null> {
    const params = new URLSearchParams({
      channel: this.config.channel,
      platform: this.config.platform,
      native_version: nativeVersion,
    });

    const res = await fetch(
      `${this.config.serverUrl}/api/releases/current?${params.toString()}`,
      { headers: this.authHeaders() },
    );

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`OTA server responded ${res.status}`);

    const body = (await res.json()) as { success: boolean; data: OtaRelease };
    return body.data;
  }

  private async resolveCurrentVersion(): Promise<string> {
    try {
      const stored = await storage.getCurrentVersion();
      if (stored) return stored;
    } catch {
      // AsyncStorage unavailable — fall through to runtime version
    }
    return (
      Updates.runtimeVersion ?? Application.nativeApplicationVersion ?? "0.0.0"
    );
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }
}
