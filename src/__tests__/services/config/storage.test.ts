import { configStorage } from "../../../services/config/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RemoteConfig } from "../../../services/config/types";

const mockConfig: RemoteConfig = {
  flags: { new_ui: true },
  experiments: { onboarding: "control" },
  urls: { api_base: "https://api.rumik.app" },
  kill_switches: { payments: false },
  ttl: 300,
  version: "abc123",
};

describe("configStorage", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("returns null when nothing cached", async () => {
    const result = await configStorage.getCache();
    expect(result).toBeNull();
  });

  it("stores and retrieves config", async () => {
    await configStorage.setCache(mockConfig);
    const result = await configStorage.getCache();
    expect(result).not.toBeNull();
    expect(result?.config).toEqual(mockConfig);
    expect(result?.cachedAt).toBeInstanceOf(Date);
  });

  it("clears cache", async () => {
    await configStorage.setCache(mockConfig);
    await configStorage.clearCache();
    const result = await configStorage.getCache();
    expect(result).toBeNull();
  });

  it("returns null if only cache key exists (no timestamp)", async () => {
    await AsyncStorage.setItem("config:cache", JSON.stringify(mockConfig));
    const result = await configStorage.getCache();
    expect(result).toBeNull();
  });

  it("cachedAt is a valid Date from timestamp", async () => {
    await configStorage.setCache(mockConfig);
    const result = await configStorage.getCache();
    expect(result?.cachedAt.getTime()).toBeGreaterThan(0);
  });
});
