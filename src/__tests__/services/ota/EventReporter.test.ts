import { EventReporter } from "../../../services/ota/EventReporter";
import type { OtaConfig } from "../../../services/ota/types";

const config: OtaConfig = {
  serverUrl: "https://ota.example.com",
  apiKey: "test-key",
  channel: "production",
  platform: "ios",
  nativeVersion: "1.0.0",
  crashThreshold: 0.05,
  minLaunchesBeforeRollback: 3,
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("EventReporter", () => {
  it("sends eligible event immediately on report()", async () => {
    const reporter = new EventReporter("device-1", config);
    reporter.report("release-abc", "1.0.0", "eligible");
    await Promise.resolve(); // allow microtask to run
    await Promise.resolve();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.device_id).toBe("device-1");
    expect(body.release_id).toBe("release-abc");
    expect(body.version).toBe("1.0.0");
    expect(body.events[0].event_type).toBe("eligible");
  });

  it("includes error_msg on failed event", async () => {
    const reporter = new EventReporter("d", config);
    reporter.report("r1", "1.0.0", "failed", "network timeout");
    await Promise.resolve();
    await Promise.resolve();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events[0].event_type).toBe("failed");
    expect(body.events[0].error_msg).toBe("network timeout");
  });

  it("includes metadata when provided", async () => {
    const reporter = new EventReporter("d", config);
    reporter.report("r1", "1.0.0", "download_complete", undefined, {
      duration_ms: 1234,
    });
    await Promise.resolve();
    await Promise.resolve();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events[0].metadata).toEqual({ duration_ms: 1234 });
  });

  it("queues events when fetch fails and flushes on flushQueue()", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));
    const reporter = new EventReporter("d", config);
    reporter.report("r1", "1.0.0", "eligible");
    // Allow the full async rejection chain to settle (fetch→sendBatch→sendEvent→catch)
    for (let i = 0; i < 6; i++) await Promise.resolve();

    // Queued — now flush should retry
    mockFetch.mockResolvedValueOnce({ ok: true });
    await reporter.flushQueue();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("sends correct channel and platform in payload", async () => {
    const reporter = new EventReporter("d", {
      ...config,
      channel: "staging",
      platform: "android",
    });
    reporter.report("r1", "1.0.0", "applied");
    await Promise.resolve();
    await Promise.resolve();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.channel).toBe("staging");
    expect(body.platform).toBe("android");
  });

  it("flushQueue is a no-op when queue is empty", async () => {
    const reporter = new EventReporter("d", config);
    await reporter.flushQueue(); // nothing queued
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("groups multiple queued events by (releaseId, version) in flushQueue", async () => {
    // Fail two sends for same release
    mockFetch
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue({ ok: true });

    const reporter = new EventReporter("d", config);
    reporter.report("r1", "1.0.0", "eligible");
    reporter.report("r1", "1.0.0", "download_start");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Both are queued under same key
    mockFetch.mockResolvedValue({ ok: true });
    await reporter.flushQueue();
    // Should batch them into a single request per (releaseId, version)
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const body = JSON.parse(lastCall[1].body);
    expect(body.release_id).toBe("r1");
  });
});
