import { CrashTracker } from '../../../services/ota/crashTracker';
import { storage } from '../../../services/ota/storage';

jest.mock('../../../services/ota/storage', () => ({
  storage: {
    getSessionOpen: jest.fn().mockResolvedValue(null),
    markSessionOpen: jest.fn().mockResolvedValue(undefined),
    clearSessionOpen: jest.fn().mockResolvedValue(undefined),
    getLaunchRecords: jest.fn().mockResolvedValue({}),
    setLaunchRecords: jest.fn().mockResolvedValue(undefined),
  },
}));

// AppState mock — capture listener so tests can fire it
let capturedAppStateListener: ((state: string) => void) | null = null;
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_, cb) => {
      capturedAppStateListener = cb;
      return { remove: jest.fn() };
    }),
  },
}));

// ErrorUtils global mock
const mockGetGlobalHandler = jest.fn().mockReturnValue(null);
const mockSetGlobalHandler = jest.fn();
(global as unknown as Record<string, unknown>).ErrorUtils = {
  getGlobalHandler: mockGetGlobalHandler,
  setGlobalHandler: mockSetGlobalHandler,
};

const storageMock = storage as jest.Mocked<typeof storage>;

beforeEach(() => {
  jest.clearAllMocks();
  capturedAppStateListener = null;
  storageMock.getSessionOpen.mockResolvedValue(null);
  storageMock.markSessionOpen.mockResolvedValue(undefined);
  storageMock.clearSessionOpen.mockResolvedValue(undefined);
  storageMock.getLaunchRecords.mockResolvedValue({});
  storageMock.setLaunchRecords.mockResolvedValue(undefined);
  mockGetGlobalHandler.mockReturnValue(null);
});

function makeTracker(threshold = 0.5, minLaunches = 3) {
  const cb = jest.fn();
  const tracker = new CrashTracker('1.1.0', cb, threshold, minLaunches);
  return { tracker, cb };
}

describe('CrashTracker.initialize', () => {
  it('initializes without crash on clean session', async () => {
    const { tracker } = makeTracker();
    await tracker.initialize();

    expect(storageMock.markSessionOpen).toHaveBeenCalledWith('1.1.0');
    expect(storageMock.getLaunchRecords).not.toHaveBeenCalled();
    tracker.destroy();
  });

  it('increments crash count when a previous session was unclosed', async () => {
    storageMock.getSessionOpen.mockResolvedValueOnce({
      version: '1.0.0',
      at: new Date().toISOString(),
    });
    storageMock.getLaunchRecords.mockResolvedValue({});

    const { tracker } = makeTracker();
    await tracker.initialize();

    expect(storageMock.setLaunchRecords).toHaveBeenCalled();
    tracker.destroy();
  });

  it('registers an AppState listener', async () => {
    const { tracker } = makeTracker();
    await tracker.initialize();

    expect(capturedAppStateListener).not.toBeNull();
    tracker.destroy();
  });

  it('registers a global JS error handler', async () => {
    const { tracker } = makeTracker();
    await tracker.initialize();

    expect(mockSetGlobalHandler).toHaveBeenCalled();
    tracker.destroy();
  });
});

describe('CrashTracker.onAppStateChange', () => {
  it('clears session marker on background', async () => {
    const { tracker } = makeTracker();
    await tracker.initialize();

    await capturedAppStateListener!('background');
    expect(storageMock.clearSessionOpen).toHaveBeenCalled();
    tracker.destroy();
  });

  it('clears session marker on inactive', async () => {
    const { tracker } = makeTracker();
    await tracker.initialize();

    await capturedAppStateListener!('inactive');
    expect(storageMock.clearSessionOpen).toHaveBeenCalled();
    tracker.destroy();
  });

  it('reopens session marker when returning to active', async () => {
    const { tracker } = makeTracker();
    await tracker.initialize();

    await capturedAppStateListener!('active');
    // markSessionOpen called once on init + once on active
    expect(storageMock.markSessionOpen).toHaveBeenCalledTimes(2);
    tracker.destroy();
  });
});

describe('CrashTracker.recordLaunch', () => {
  it('increments launch count for the current version', async () => {
    const { tracker } = makeTracker();

    await tracker.recordLaunch();

    const call = storageMock.setLaunchRecords.mock.calls[0][0];
    expect(call['1.1.0'].launchCount).toBe(1);
  });
});

describe('CrashTracker.getStats', () => {
  it('returns zeros when no records exist', async () => {
    const { tracker } = makeTracker();

    const stats = await tracker.getStats('1.1.0');
    expect(stats).toEqual({ launchCount: 0, crashCount: 0, crashRate: 0 });
  });

  it('returns correct crash rate', async () => {
    storageMock.getLaunchRecords.mockResolvedValue({
      '1.1.0': { version: '1.1.0', launchCount: 10, crashCount: 4, lastCrashAt: null },
    });
    const { tracker } = makeTracker();

    const stats = await tracker.getStats('1.1.0');
    expect(stats.crashRate).toBeCloseTo(0.4);
  });
});

describe('CrashTracker threshold evaluation', () => {
  it('fires callback when crash rate exceeds threshold after min launches', async () => {
    storageMock.getLaunchRecords.mockResolvedValue({
      '1.1.0': { version: '1.1.0', launchCount: 5, crashCount: 0, lastCrashAt: null },
    });

    const { tracker, cb } = makeTracker(0.5, 3);
    // Trigger incrementCrashCount indirectly via unclosed previous session
    storageMock.getSessionOpen.mockResolvedValueOnce({
      version: '1.1.0',
      at: new Date().toISOString(),
    });
    storageMock.getLaunchRecords
      .mockResolvedValueOnce({
        '1.1.0': { version: '1.1.0', launchCount: 5, crashCount: 3, lastCrashAt: null },
      })
      .mockResolvedValue({});

    await tracker.initialize();
    expect(cb).toHaveBeenCalledWith('1.1.0', expect.any(Number));
    tracker.destroy();
  });

  it('does not fire callback before minLaunches', async () => {
    storageMock.getSessionOpen.mockResolvedValueOnce({
      version: '1.1.0',
      at: new Date().toISOString(),
    });
    storageMock.getLaunchRecords.mockResolvedValueOnce({
      '1.1.0': { version: '1.1.0', launchCount: 1, crashCount: 0, lastCrashAt: null },
    });

    const { tracker, cb } = makeTracker(0.5, 3);
    await tracker.initialize();
    expect(cb).not.toHaveBeenCalled();
    tracker.destroy();
  });
});

describe('CrashTracker.destroy', () => {
  it('restores the previous error handler', async () => {
    const prev = jest.fn();
    mockGetGlobalHandler.mockReturnValue(prev);

    const { tracker } = makeTracker();
    await tracker.initialize();
    tracker.destroy();

    expect(mockSetGlobalHandler).toHaveBeenLastCalledWith(prev);
  });
});
