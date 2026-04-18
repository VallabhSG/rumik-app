import { OtaClient } from "../../../services/ota/OtaClient";
import * as Updates from "expo-updates";

import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("expo-updates", () => ({
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
  runtimeVersion: "1.0.0",
}));

jest.mock("expo-application", () => ({
  nativeApplicationVersion: "1.0.0",
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiGet: jest.fn().mockResolvedValue([]),
  multiSet: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
}));

// Stable install ID so rollout bucket is predictable
jest.mock("../../../services/ota/deviceId", () => ({
  getInstallId: jest.fn().mockResolvedValue("test-device-id"),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const BASE_CONFIG = {
  serverUrl: "https://ota.example.com",
  apiKey: "test-key",
  channel: "production",
  platform: "ios" as const,
  nativeVersion: "1.0.0",
  crashThreshold: 0.5,
  minLaunchesBeforeRollback: 3,
};

function makeRelease(overrides = {}) {
  return {
    id: "release-001",
    version: "1.1.0",
    channel: "production",
    platform: "all",
    rollout_percentage: 100,
    is_rollback: false,
    status: "active",
    commit_sha: null,
    min_native_version: null,
    max_native_version: null,
    release_notes: null,
    metadata: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// checkForUpdate
// ---------------------------------------------------------------------------

describe("OtaClient.checkForUpdate", () => {
  it("returns up-to-date when server has no release (404)", async () => {
    mockFetch.mockResolvedValueOnce({ status: 404, ok: false });

    const statuses: string[] = [];
    const client = new OtaClient(BASE_CONFIG, (s) => statuses.push(s));
    await client.initialize();
    const result = await client.checkForUpdate();

    expect(result).toBe("up-to-date");
    expect(statuses).toContain("up-to-date");
    client.destroy();
  });

  it("returns available when server returns a new version", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: makeRelease({ version: "1.1.0" }),
        }),
    });
    // current version from storage is null → falls back to runtimeVersion '1.0.0'
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    const statuses: string[] = [];
    const client = new OtaClient(BASE_CONFIG, (s) => statuses.push(s));
    await client.initialize();
    const result = await client.checkForUpdate();

    expect(result).toBe("available");
    client.destroy();
  });

  it("returns up-to-date when current version matches release version", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: makeRelease({ version: "1.0.0" }),
        }),
    });

    const statuses: string[] = [];
    const client = new OtaClient(BASE_CONFIG, (s) => statuses.push(s));
    await client.initialize();
    const result = await client.checkForUpdate();

    expect(result).toBe("up-to-date");
    client.destroy();
  });

  it("returns not-in-rollout when device is outside rollout percentage", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: makeRelease({ version: "1.1.0", rollout_percentage: 0 }),
        }),
    });

    const statuses: string[] = [];
    const client = new OtaClient(BASE_CONFIG, (s) => statuses.push(s));
    await client.initialize();
    const result = await client.checkForUpdate();

    expect(result).toBe("not-in-rollout");
    client.destroy();
  });

  it("returns error when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const statuses: string[] = [];
    const client = new OtaClient(BASE_CONFIG, (s) => statuses.push(s));
    await client.initialize();
    const result = await client.checkForUpdate();

    expect(result).toBe("error");
    client.destroy();
  });
});

// ---------------------------------------------------------------------------
// downloadAndStage
// ---------------------------------------------------------------------------

describe("OtaClient.downloadAndStage", () => {
  it("returns ready after successful fetch", async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValueOnce({
      isAvailable: true,
    });
    (Updates.fetchUpdateAsync as jest.Mock).mockResolvedValueOnce({});
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: makeRelease({ version: "1.1.0" }),
        }),
    });

    const statuses: string[] = [];
    const client = new OtaClient(BASE_CONFIG, (s) => statuses.push(s));
    await client.initialize();
    const result = await client.downloadAndStage();

    expect(result).toBe("ready");
    expect(Updates.fetchUpdateAsync).toHaveBeenCalled();
    client.destroy();
  });

  it("returns up-to-date when expo-updates has no new bundle", async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValueOnce({
      isAvailable: false,
    });

    const statuses: string[] = [];
    const client = new OtaClient(BASE_CONFIG, (s) => statuses.push(s));
    await client.initialize();
    const result = await client.downloadAndStage();

    expect(result).toBe("up-to-date");
    client.destroy();
  });

  it("returns error when download throws", async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockRejectedValueOnce(
      new Error("download failed"),
    );

    const statuses: string[] = [];
    const client = new OtaClient(BASE_CONFIG, (s) => statuses.push(s));
    await client.initialize();
    const result = await client.downloadAndStage();

    expect(result).toBe("error");
    client.destroy();
  });
});
