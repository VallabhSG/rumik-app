import { renderHook, act } from '@testing-library/react-native';
import { useOtaUpdate } from '../../hooks/useOtaUpdate';

// --- Module mocks ---

const mockInitialize = jest.fn().mockResolvedValue(undefined);
const mockCheckForUpdate = jest.fn().mockResolvedValue('up-to-date');
const mockDownloadAndStage = jest.fn().mockResolvedValue('ready');
const mockApplyNow = jest.fn().mockResolvedValue(undefined);
const mockDestroy = jest.fn();

jest.mock('../../services/ota/OtaClient', () => ({
  OtaClient: jest.fn().mockImplementation((_config: unknown, onStatus: (s: string) => void) => ({
    initialize: mockInitialize,
    checkForUpdate: mockCheckForUpdate,
    downloadAndStage: mockDownloadAndStage,
    applyNow: mockApplyNow,
    destroy: mockDestroy,
    _onStatus: onStatus,
  })),
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
}));

// Expose __onStatus from the mock instance so tests can call it
function getOnStatus(): (s: string) => void {
  const { OtaClient } = require('../../services/ota/OtaClient');
  const instances = (OtaClient as jest.Mock).mock.results;
  return instances[instances.length - 1]?.value?._onStatus;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Restore default resolved values
  mockInitialize.mockResolvedValue(undefined);
  mockCheckForUpdate.mockResolvedValue('up-to-date');
  mockDownloadAndStage.mockResolvedValue('ready');
  mockApplyNow.mockResolvedValue(undefined);

  // Default env — serverUrl set so the effect runs
  process.env.EXPO_PUBLIC_OTA_SERVER_URL = 'https://ota.example.com';
  process.env.EXPO_PUBLIC_OTA_API_KEY = 'key';
  process.env.EXPO_PUBLIC_OTA_CHANNEL = 'production';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_OTA_SERVER_URL;
});

describe('useOtaUpdate', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useOtaUpdate());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('initializes client and checks for update on mount', async () => {
    renderHook(() => useOtaUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockInitialize).toHaveBeenCalled();
    expect(mockCheckForUpdate).toHaveBeenCalled();
  });

  it('reflects available status via onStatus callback', async () => {
    const { result } = renderHook(() => useOtaUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      getOnStatus()('available');
    });

    expect(result.current.status).toBe('available');
    expect(result.current.error).toBeNull();
  });

  it('sets error status when initialization throws', async () => {
    mockInitialize.mockRejectedValueOnce(new Error('init failed'));

    const { result } = renderHook(() => useOtaUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('init failed');
  });

  it('calls downloadAndStage when download() is invoked', async () => {
    const { result } = renderHook(() => useOtaUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      await result.current.download();
    });

    expect(mockDownloadAndStage).toHaveBeenCalled();
  });

  it('sets error when download throws', async () => {
    mockDownloadAndStage.mockRejectedValueOnce(new Error('dl failed'));

    const { result } = renderHook(() => useOtaUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      await result.current.download();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('dl failed');
  });

  it('calls applyNow when applyNow() is invoked', async () => {
    const { result } = renderHook(() => useOtaUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      await result.current.applyNow();
    });

    expect(mockApplyNow).toHaveBeenCalled();
  });

  it('stays idle when serverUrl is not configured', async () => {
    delete process.env.EXPO_PUBLIC_OTA_SERVER_URL;

    const { result } = renderHook(() => useOtaUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockInitialize).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('destroys the client on unmount', async () => {
    const { unmount } = renderHook(() => useOtaUpdate());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    unmount();
    expect(mockDestroy).toHaveBeenCalled();
  });
});
