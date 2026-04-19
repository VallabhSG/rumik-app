import React from "react";
import { render, act } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  RemoteConfigProvider,
  useFeatureFlag,
  useExperiment,
  useKillSwitch,
  useDynamicUrl,
  useRemoteConfigClient,
} from "../../hooks/useRemoteConfig";
import { ConfigClient } from "../../services/config/ConfigClient";
import type { RemoteConfig } from "../../services/config/types";

// Mock ConfigClient to avoid real network calls and AsyncStorage
jest.mock("../../services/config/ConfigClient");
jest.mock("../../services/ota/deviceId", () => ({
  getInstallId: jest.fn().mockResolvedValue("test-device-id"),
}));

const MockConfigClient = ConfigClient as jest.MockedClass<typeof ConfigClient>;

const mockConfig: RemoteConfig = {
  flags: { new_ui: true, dark_mode: false },
  experiments: { onboarding: "treatment" },
  urls: { api_base: "https://api.rumik.app" },
  kill_switches: { payments: true },
  ttl: 300,
  version: "v1",
};

function setupMockClient() {
  let listener: (() => void) | null = null;
  const mockInstance = {
    initialize: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
    getFlag: jest.fn(
      (key: string, def: boolean) => mockConfig.flags[key] ?? def,
    ),
    getExperiment: jest.fn(
      (key: string, def: string) => mockConfig.experiments[key] ?? def,
    ),
    getUrl: jest.fn((key: string, def: string) => mockConfig.urls[key] ?? def),
    isKillSwitchActive: jest.fn(
      (key: string) => mockConfig.kill_switches[key] ?? false,
    ),
    getStatus: jest.fn().mockReturnValue("ready"),
    subscribe: jest.fn((fn: () => void) => {
      listener = fn;
      return () => {
        listener = null;
      };
    }),
    refresh: jest.fn(),
    triggerUpdate: () => listener?.(),
  };
  MockConfigClient.mockImplementation(
    () => mockInstance as unknown as ConfigClient,
  );
  return mockInstance;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <RemoteConfigProvider serverUrl="https://ota.rumik.app" apiKey="test-key">
      {children}
    </RemoteConfigProvider>
  );
}

describe("RemoteConfigProvider + hooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws when hooks used outside provider", () => {
    function BadComponent() {
      useRemoteConfigClient();
      return null;
    }
    // Suppress error output for this test
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<BadComponent />)).toThrow(
      "useRemoteConfigClient must be used inside",
    );
    spy.mockRestore();
  });

  it("useFeatureFlag returns true for enabled flag", () => {
    setupMockClient();
    function TestComponent() {
      const flag = useFeatureFlag("new_ui", false);
      return <Text testID="result">{String(flag)}</Text>;
    }
    const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
    expect(getByTestId("result").props.children).toBe("true");
  });

  it("useFeatureFlag returns false for disabled flag", () => {
    setupMockClient();
    function TestComponent() {
      const flag = useFeatureFlag("dark_mode", true);
      return <Text testID="result">{String(flag)}</Text>;
    }
    const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
    expect(getByTestId("result").props.children).toBe("false");
  });

  it("useFeatureFlag returns default for unknown flag", () => {
    setupMockClient();
    function TestComponent() {
      const flag = useFeatureFlag("unknown", true);
      return <Text testID="result">{String(flag)}</Text>;
    }
    const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
    expect(getByTestId("result").props.children).toBe("true");
  });

  it("useExperiment returns assigned variant", () => {
    setupMockClient();
    function TestComponent() {
      const variant = useExperiment("onboarding", "control");
      return <Text testID="result">{variant}</Text>;
    }
    const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
    expect(getByTestId("result").props.children).toBe("treatment");
  });

  it("useExperiment returns default for unknown experiment", () => {
    setupMockClient();
    function TestComponent() {
      const variant = useExperiment("unknown_exp", "control");
      return <Text testID="result">{variant}</Text>;
    }
    const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
    expect(getByTestId("result").props.children).toBe("control");
  });

  it("useKillSwitch returns true for active switch", () => {
    setupMockClient();
    function TestComponent() {
      const active = useKillSwitch("payments");
      return <Text testID="result">{String(active)}</Text>;
    }
    const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
    expect(getByTestId("result").props.children).toBe("true");
  });

  it("useKillSwitch returns false for unknown switch", () => {
    setupMockClient();
    function TestComponent() {
      const active = useKillSwitch("unknown");
      return <Text testID="result">{String(active)}</Text>;
    }
    const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
    expect(getByTestId("result").props.children).toBe("false");
  });

  it("useDynamicUrl returns configured URL", () => {
    setupMockClient();
    function TestComponent() {
      const url = useDynamicUrl("api_base", "https://fallback.api");
      return <Text testID="result">{url}</Text>;
    }
    const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
    expect(getByTestId("result").props.children).toBe("https://api.rumik.app");
  });

  it("useDynamicUrl returns fallback for unknown key", () => {
    setupMockClient();
    function TestComponent() {
      const url = useDynamicUrl("cdn_url", "https://cdn.default");
      return <Text testID="result">{url}</Text>;
    }
    const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
    expect(getByTestId("result").props.children).toBe("https://cdn.default");
  });

  it("re-renders when config updates via subscribe", async () => {
    const mock = setupMockClient();
    // useSyncExternalStore only re-renders when getSnapshot returns a new value.
    // Start with true, flip to false on the triggered update.
    let currentValue = true;
    mock.getFlag.mockImplementation((key: string, def: boolean) =>
      key === "new_ui" ? currentValue : (mockConfig.flags[key] ?? def),
    );

    let renderCount = 0;
    function TestComponent() {
      const flag = useFeatureFlag("new_ui", false);
      renderCount++;
      return <Text testID="result">{String(flag)}</Text>;
    }

    render(<TestComponent />, { wrapper: Wrapper });
    const initialRenders = renderCount;

    // Change the underlying value and notify subscribers
    await act(async () => {
      currentValue = false;
      mock.triggerUpdate();
    });

    expect(renderCount).toBeGreaterThan(initialRenders);
  });

  it("calls initialize and destroy on ConfigClient lifecycle", async () => {
    const mock = setupMockClient();
    const { unmount } = render(<Text />, { wrapper: Wrapper });

    await act(async () => {});
    expect(mock.initialize).toHaveBeenCalled();

    unmount();
    expect(mock.destroy).toHaveBeenCalled();
  });
});
