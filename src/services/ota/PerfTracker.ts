import type { OtaConfig } from './types';

type MetricType = 'startup_ms' | 'update_download_ms' | 'js_fps' | 'memory_mb' | 'ttfb_ms';

interface PerfEvent {
  metric_type: MetricType;
  value: number;
  recorded_at: string;
}

const FLUSH_INTERVAL_MS = 30_000;
const MIN_FLUSH_INTERVAL_MS = 10_000;

export class PerfTracker {
  private queue: PerfEvent[] = [];
  private deviceId: string;
  private version: string;
  private config: OtaConfig;
  private lastFlush = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deviceId: string, version: string, config: OtaConfig) {
    this.deviceId = deviceId;
    this.version = version;
    this.config = config;
  }

  start(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, FLUSH_INTERVAL_MS);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush().catch(() => {});
  }

  record(type: MetricType, value: number): void {
    this.queue.push({ metric_type: type, value, recorded_at: new Date().toISOString() });
  }

  recordStartupTime(ms: number): void { this.record('startup_ms', ms); }
  recordUpdateDownload(ms: number): void { this.record('update_download_ms', ms); }
  recordFrameRate(fps: number): void { this.record('js_fps', fps); }
  recordMemory(mb: number): void { this.record('memory_mb', mb); }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const now = Date.now();
    if (now - this.lastFlush < MIN_FLUSH_INTERVAL_MS) return;

    const batch = this.queue.splice(0);
    this.lastFlush = now;

    try {
      await fetch(`${this.config.serverUrl}/api/perf-metrics`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: this.deviceId,
          version: this.version,
          channel: this.config.channel,
          platform: this.config.platform,
          metrics: batch,
        }),
      });
    } catch {
      // Restore queue on failure so data isn't lost
      this.queue.unshift(...batch);
    }
  }
}
