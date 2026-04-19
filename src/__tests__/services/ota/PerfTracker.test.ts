import { PerfTracker } from '../../../services/ota/PerfTracker';
import type { OtaConfig } from '../../../services/ota/types';

const config: OtaConfig = {
  serverUrl: 'https://ota.example.com',
  apiKey: 'test-key',
  channel: 'production',
  platform: 'ios',
  nativeVersion: '1.0.0',
  crashThreshold: 0.05,
  minLaunchesBeforeRollback: 3,
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PerfTracker', () => {
  it('queues metrics and flushes on flush()', async () => {
    const tracker = new PerfTracker('device-1', '1.0.0', config);
    tracker.recordStartupTime(850);
    tracker.recordUpdateDownload(1200);

    await tracker.flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.device_id).toBe('device-1');
    expect(body.version).toBe('1.0.0');
    expect(body.metrics).toHaveLength(2);
    expect(body.metrics[0].metric_type).toBe('startup_ms');
    expect(body.metrics[0].value).toBe(850);
    expect(body.metrics[1].metric_type).toBe('update_download_ms');
    expect(body.metrics[1].value).toBe(1200);
  });

  it('clears queue after successful flush', async () => {
    const tracker = new PerfTracker('device-1', '1.0.0', config);
    tracker.recordStartupTime(500);
    await tracker.flush();
    mockFetch.mockClear();
    await tracker.flush(); // nothing queued
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('restores queue on failed flush', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));
    const tracker = new PerfTracker('device-1', '1.0.0', config);
    tracker.recordStartupTime(500);
    await tracker.flush();
    // Queue should be restored — a retry flush will send again
    mockFetch.mockResolvedValueOnce({ ok: true });
    jest.advanceTimersByTime(15_000); // past MIN_FLUSH_INTERVAL
    await tracker.flush();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not flush twice within MIN_FLUSH_INTERVAL', async () => {
    const tracker = new PerfTracker('device-1', '1.0.0', config);
    tracker.recordStartupTime(500);
    await tracker.flush(); // first flush — succeeds
    tracker.recordFrameRate(60);
    await tracker.flush(); // too soon — skipped
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('records all metric types via convenience methods', () => {
    const tracker = new PerfTracker('d', '1.0.0', config);
    tracker.recordStartupTime(100);
    tracker.recordUpdateDownload(200);
    tracker.recordFrameRate(60);
    tracker.recordMemory(128);
    // Access via record() too
    tracker.record('ttfb_ms', 50);
    // Verify queue has 5 items
    // We'll verify via flush payload
    mockFetch.mockResolvedValueOnce({ ok: true });
    jest.advanceTimersByTime(15_000);
    return tracker.flush().then(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.metrics).toHaveLength(5);
      const types = body.metrics.map((m: { metric_type: string }) => m.metric_type);
      expect(types).toContain('startup_ms');
      expect(types).toContain('update_download_ms');
      expect(types).toContain('js_fps');
      expect(types).toContain('memory_mb');
      expect(types).toContain('ttfb_ms');
    });
  });

  it('stop() flushes remaining queue', async () => {
    const tracker = new PerfTracker('d', '1.0.0', config);
    tracker.start();
    tracker.recordStartupTime(300);
    jest.advanceTimersByTime(15_000);
    tracker.stop();
    // flush is async — wait for it
    await Promise.resolve();
    await Promise.resolve();
    expect(mockFetch).toHaveBeenCalled();
  });

  it('sends correct channel and platform', async () => {
    const tracker = new PerfTracker('d', '2.0.0', { ...config, channel: 'staging', platform: 'android' });
    tracker.recordStartupTime(400);
    jest.advanceTimersByTime(15_000);
    await tracker.flush();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.channel).toBe('staging');
    expect(body.platform).toBe('android');
  });
});
