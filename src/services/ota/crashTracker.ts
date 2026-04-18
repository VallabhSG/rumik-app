import { AppState, type AppStateStatus } from "react-native";
import { storage } from "./storage";

type CrashCallback = (version: string, crashRate: number) => void;

/**
 * Two-layer crash detection:
 *
 * 1. Session watchdog — writes a "session open" marker at launch and
 *    clears it when the app moves to background. If we find an unclosed
 *    marker on the next launch, the previous session crashed.
 *
 * 2. JS fatal error handler — hooks ErrorUtils to increment the crash
 *    counter immediately when a fatal JS exception is thrown.
 *
 * Both paths write to the same per-version LaunchRecord in AsyncStorage.
 */
export class CrashTracker {
  private version: string;
  private onThresholdExceeded: CrashCallback;
  private threshold: number;
  private minLaunches: number;
  private appStateSub: ReturnType<typeof AppState.addEventListener> | null =
    null;
  private prevErrorHandler: ((error: Error, isFatal?: boolean) => void) | null =
    null;

  constructor(
    version: string,
    onThresholdExceeded: CrashCallback,
    threshold: number,
    minLaunches: number,
  ) {
    this.version = version;
    this.onThresholdExceeded = onThresholdExceeded;
    this.threshold = threshold;
    this.minLaunches = minLaunches;
  }

  async initialize(): Promise<void> {
    // --- Watchdog check ---
    // If the previous session left an open marker, it crashed.
    const prev = await storage.getSessionOpen();
    if (prev) {
      await this.incrementCrashCount(prev.version);
    }

    // Open marker for the current session
    await storage.markSessionOpen(this.version);

    // Clear marker on graceful background transition
    this.appStateSub = AppState.addEventListener(
      "change",
      this.onAppStateChange,
    );

    // --- JS fatal error handler ---
    this.prevErrorHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler(async (error, isFatal) => {
      if (isFatal) {
        await this.incrementCrashCount(this.version);
      }
      this.prevErrorHandler?.(error, isFatal);
    });
  }

  private onAppStateChange = async (state: AppStateStatus): Promise<void> => {
    if (state === "background" || state === "inactive") {
      await storage.clearSessionOpen();
    } else if (state === "active") {
      // Re-open the marker if the app comes back to foreground within the same process
      await storage.markSessionOpen(this.version);
    }
  };

  private async incrementCrashCount(version: string): Promise<void> {
    const records = await storage.getLaunchRecords();
    const rec = records[version] ?? {
      version,
      launchCount: 0,
      crashCount: 0,
      lastCrashAt: null,
    };
    records[version] = {
      ...rec,
      crashCount: rec.crashCount + 1,
      lastCrashAt: new Date().toISOString(),
    };
    await storage.setLaunchRecords(records);

    // Evaluate threshold after recording
    await this.evaluate(
      version,
      records[version].launchCount,
      records[version].crashCount,
    );
  }

  async recordLaunch(): Promise<void> {
    const records = await storage.getLaunchRecords();
    const rec = records[this.version] ?? {
      version: this.version,
      launchCount: 0,
      crashCount: 0,
      lastCrashAt: null,
    };
    records[this.version] = { ...rec, launchCount: rec.launchCount + 1 };
    await storage.setLaunchRecords(records);
  }

  async getStats(
    version: string,
  ): Promise<{ launchCount: number; crashCount: number; crashRate: number }> {
    const records = await storage.getLaunchRecords();
    const rec = records[version];
    if (!rec || rec.launchCount === 0)
      return { launchCount: 0, crashCount: 0, crashRate: 0 };
    return {
      launchCount: rec.launchCount,
      crashCount: rec.crashCount,
      crashRate: rec.crashCount / rec.launchCount,
    };
  }

  private async evaluate(
    version: string,
    launchCount: number,
    crashCount: number,
  ): Promise<void> {
    if (launchCount < this.minLaunches) return;
    const crashRate = crashCount / launchCount;
    if (crashRate > this.threshold) {
      this.onThresholdExceeded(version, crashRate);
    }
  }

  destroy(): void {
    this.appStateSub?.remove();
    if (this.prevErrorHandler) {
      ErrorUtils.setGlobalHandler(this.prevErrorHandler);
    }
  }
}
