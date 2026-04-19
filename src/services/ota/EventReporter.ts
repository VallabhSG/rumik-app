import type { OtaConfig } from './types';

type UpdateEventType =
  | 'eligible'
  | 'notified'
  | 'download_start'
  | 'download_complete'
  | 'staged'
  | 'applied'
  | 'skipped'
  | 'failed';

interface PendingEvent {
  event_type: UpdateEventType;
  error_msg?: string;
  metadata?: Record<string, unknown>;
  recorded_at: string;
}

export class EventReporter {
  private config: OtaConfig;
  private deviceId: string;
  private queue: Array<{ releaseId: string; version: string; event: PendingEvent }> = [];

  constructor(deviceId: string, config: OtaConfig) {
    this.deviceId = deviceId;
    this.config = config;
  }

  report(
    releaseId: string,
    version: string,
    eventType: UpdateEventType,
    errorMsg?: string,
    metadata?: Record<string, unknown>,
  ): void {
    const event: PendingEvent = {
      event_type: eventType,
      recorded_at: new Date().toISOString(),
      ...(errorMsg ? { error_msg: errorMsg } : {}),
      ...(metadata ? { metadata } : {}),
    };

    // Fire-and-forget; batch by release
    this.sendEvent(releaseId, version, event).catch(() => {
      this.queue.push({ releaseId, version, event });
    });
  }

  async flushQueue(): Promise<void> {
    if (this.queue.length === 0) return;
    const pending = this.queue.splice(0);
    // Group by (releaseId, version)
    const groups = new Map<string, typeof pending>();
    for (const item of pending) {
      const key = `${item.releaseId}::${item.version}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    await Promise.allSettled(
      Array.from(groups.entries()).map(([, items]) =>
        this.sendBatch(items[0].releaseId, items[0].version, items.map(i => i.event)),
      ),
    );
  }

  private async sendEvent(releaseId: string, version: string, event: PendingEvent): Promise<void> {
    await this.sendBatch(releaseId, version, [event]);
  }

  private async sendBatch(releaseId: string, version: string, events: PendingEvent[]): Promise<void> {
    await fetch(`${this.config.serverUrl}/api/update-events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: this.deviceId,
        release_id: releaseId,
        version,
        channel: this.config.channel,
        platform: this.config.platform,
        events,
      }),
    });
  }
}
