import { ConfigClient } from "../../../services/config/ConfigClient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  RemoteConfig,
  ConfigClientOptions,
} from "../../../services/config/types";

/** Flush all pending microtasks (handles nested awaits in fetchAndUpdate). */
const flushPromises = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const mockConfig: RemoteConfig = {
  flags: { new_ui: true, dark_mode: false },
  experiments: { onboarding: "treatment" },
  urls: { api_base: "https://api.rumik.app" },
  kill_switches: { payments: false },
  ttl: 300,
  version: "v1",
};

const updatedConfig: RemoteConfig = {
  ...mockConfig,
  flags: { new_ui: false, dark_mode: true },
  version: "v2",
};

function buildOptions(
  overrides: Partial<ConfigClientOptions> = {},
): ConfigClientOptions {
  return {
    serverUrl: "https://ota.rumik.app",
    apiKey: "test-key",
    platform: "ios",
    nativeVersion: "1.5.0",
    installId: "device-test-123",
    ...overrides,
  };
}

function mockFetch(config: RemoteConfig, status = 200) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ success: true, data: config }),
  });
}

describe("ConfigClient", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initialize", () => {
    it("loads empty config when no cache and fetch fails", async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error("network error"),
      );
      const client = new ConfigClient(buildOptions());
      await client.initialize();
      await flushPromises();
      expect(client.getFlag("new_ui", false)).toBe(false);
      expect(client.getStatus()).toBe("error");
      client.destroy();
    });

    it("serves cached config immediately while fetching", async () => {
      // Pre-populate cache
      await AsyncStorage.setItem("config:cache", JSON.stringify(mockConfig));
      await AsyncStorage.setItem("config:cached_at", new Date().toISOString());

      mockFetch(mockConfig);
      const client = new ConfigClient(buildOptions());
      await client.initialize();

      // Cache is loaded synchronously inside initialize before the fetch
      expect(client.getFlag("new_ui", false)).toBe(true);
      client.destroy();
    });

    it("updates config when fetch returns new version", async () => {
      await AsyncStorage.setItem("config:cache", JSON.stringify(mockConfig));
      await AsyncStorage.setItem("config:cached_at", new Date().toISOString());

      mockFetch(updatedConfig);
      const listener = jest.fn();
      const client = new ConfigClient(buildOptions());
      client.subscribe(listener);
      await client.initialize();
      await flushPromises();

      expect(client.getFlag("new_ui", true)).toBe(false);
      expect(client.getFlag("dark_mode", false)).toBe(true);
      client.destroy();
    });

    it("does not notify listeners if config version unchanged", async () => {
      await AsyncStorage.setItem("config:cache", JSON.stringify(mockConfig));
      await AsyncStorage.setItem("config:cached_at", new Date().toISOString());

      mockFetch(mockConfig); // same version
      const listener = jest.fn();
      const client = new ConfigClient(buildOptions());
      client.subscribe(listener);
      await client.initialize();
      await flushPromises();

      // Listener called once for cache load, not again for same-version fetch
      expect(listener).toHaveBeenCalledTimes(1);
      client.destroy();
    });
  });

  describe("getFlag", () => {
    it("returns default when flag not in config", async () => {
      mockFetch(mockConfig);
      const client = new ConfigClient(buildOptions());
      await client.initialize();
      await flushPromises();
      expect(client.getFlag("unknown_flag", true)).toBe(true);
      expect(client.getFlag("unknown_flag", false)).toBe(false);
      client.destroy();
    });

    it("returns config value for known flag", async () => {
      mockFetch(mockConfig);
      const client = new ConfigClient(buildOptions());
      await client.initialize();
      await flushPromises();
      expect(client.getFlag("new_ui", false)).toBe(true);
      expect(client.getFlag("dark_mode", true)).toBe(false);
      client.destroy();
    });
  });

  describe("getExperiment", () => {
    it("returns variant from config", async () => {
      mockFetch(mockConfig);
      const client = new ConfigClient(buildOptions());
      await client.initialize();
      await flushPromises();
      expect(client.getExperiment("onboarding", "control")).toBe("treatment");
      client.destroy();
    });

    it("returns default when experiment not found", async () => {
      mockFetch(mockConfig);
      const client = new ConfigClient(buildOptions());
      await client.initialize();
      await flushPromises();
      expect(client.getExperiment("unknown_exp", "control")).toBe("control");
      client.destroy();
    });
  });

  describe("getUrl", () => {
    it("returns URL from config", async () => {
      mockFetch(mockConfig);
      const client = new ConfigClient(buildOptions());
      await client.initialize();
      await flushPromises();
      expect(client.getUrl("api_base", "https://fallback.api")).toBe(
        "https://api.rumik.app",
      );
      client.destroy();
    });

    it("returns default for unknown URL key", async () => {
      mockFetch(mockConfig);
      const client = new ConfigClient(buildOptions());
      await client.initialize();
      await flushPromises();
      expect(client.getUrl("cdn_url", "https://cdn.default")).toBe(
        "https://cdn.default",
      );
      client.destroy();
    });
  });

  describe("isKillSwitchActive", () => {
    it("returns false for inactive kill switch", async () => {
      mockFetch(mockConfig);
      const client = new ConfigClient(buildOptions());
      await client.initialize();
      await flushPromises();
      expect(client.isKillSwitchActive("payments")).toBe(false);
      client.destroy();
    });

    it("returns false for unknown kill switch", async () => {
      mockFetch(mockConfig);
      const client = new ConfigClient(buildOptions());
      await client.initialize();
      await flushPromises();
      expect(client.isKillSwitchActive("unknown_ks")).toBe(false);
      client.destroy();
    });
  });

  describe("stale fallback", () => {
    it("serves stale cache when fetch fails", async () => {
      await AsyncStorage.setItem("config:cache", JSON.stringify(mockConfig));
      await AsyncStorage.setItem("config:cached_at", new Date().toISOString());

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("offline"));
      const client = new ConfigClient(buildOptions());
      await client.initialize();
      await flushPromises();

      expect(client.getFlag("new_ui", false)).toBe(true); // from stale cache
      expect(client.getStatus()).toBe("stale");
      client.destroy();
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("calls listener on config update", async () => {
      mockFetch(mockConfig);
      const listener = jest.fn();
      const client = new ConfigClient(buildOptions());
      client.subscribe(listener);
      await client.initialize();
      await flushPromises();
      expect(listener).toHaveBeenCalled();
      client.destroy();
    });

    it("unsubscribe stops future notifications", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("offline"));
      const listener = jest.fn();
      const client = new ConfigClient(buildOptions());
      const unsub = client.subscribe(listener);
      unsub();
      await client.initialize();
      await flushPromises();
      expect(listener).not.toHaveBeenCalled();
      client.destroy();
    });
  });

  describe("refresh", () => {
    it("re-fetches and updates config", async () => {
      mockFetch(mockConfig);
      mockFetch(updatedConfig);

      const client = new ConfigClient(buildOptions());
      await client.initialize();
      await flushPromises();

      expect(client.getFlag("new_ui", false)).toBe(true);

      await client.refresh();
      await flushPromises();
      expect(client.getFlag("new_ui", true)).toBe(false);
      client.destroy();
    });
  });

  describe("serverUrl not set", () => {
    it("stays in loading when serverUrl is empty", async () => {
      const client = new ConfigClient(buildOptions({ serverUrl: "" }));
      await client.initialize();
      expect(client.getStatus()).toBe("loading");
      client.destroy();
    });
  });
});
