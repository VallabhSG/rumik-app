import React from "react";
import { render, act } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  RemoteConfigPayloadProvider,
  useRemoteConfig,
  useFlag,
  useExperimentVariant,
} from "../../contexts/RemoteConfigContext";

// ---------------------------------------------------------------------------
// Mock useRemoteConfigClient
// ---------------------------------------------------------------------------

let storeListener: (() => void) | null = null;

const mockClient = {
  config: {
    flags: { dark_mode: true, new_ui: false },
    experiments: { onboarding: "treatment" },
    urls: { api_base: "https://api.rumik.app" },
    kill_switches: { payments: true, feature_x: false },
  },
  getStatus: jest.fn().mockReturnValue("ready"),
  subscribe: jest.fn((fn: () => void) => {
    storeListener = fn;
    return () => { storeListener = null; };
  }),
  setUserContext: jest.fn(),
  refresh: jest.fn().mockResolvedValue(undefined),
};

jest.mock("../../hooks/useRemoteConfig", () => ({
  useRemoteConfigClient: () => mockClient,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <RemoteConfigPayloadProvider>{children}</RemoteConfigPayloadProvider>
  );
}

describe("RemoteConfigContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storeListener = null;
    mockClient.config = {
      flags: { dark_mode: true, new_ui: false },
      experiments: { onboarding: "treatment" },
      urls: { api_base: "https://api.rumik.app" },
      kill_switches: { payments: true, feature_x: false },
    };
    mockClient.getStatus.mockReturnValue("ready");
  });

  describe("RemoteConfigPayloadProvider", () => {
    it("renders children", () => {
      const { getByText } = render(
        <Wrapper>
          <Text>hello</Text>
        </Wrapper>,
      );
      expect(getByText("hello")).toBeTruthy();
    });

    it("maps kill_switches — only active ones are included", () => {
      function TestComponent() {
        const { config } = useRemoteConfig();
        return <Text testID="ks">{config.kill_switches.join(",")}</Text>;
      }
      const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
      // feature_x is false so only payments should be in the array
      expect(getByTestId("ks").props.children).toBe("payments");
    });

    it("maps experiments to ExperimentAssignment objects", () => {
      function TestComponent() {
        const { config } = useRemoteConfig();
        const exp = config.experiments["onboarding"];
        return (
          <Text testID="exp">
            {exp?.variant_id}:{exp?.experiment_key}
          </Text>
        );
      }
      const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
      expect(getByTestId("exp").props.children).toEqual([
        "treatment",
        ":",
        "onboarding",
      ]);
    });

    it("maps urls to remote_urls", () => {
      function TestComponent() {
        const { config } = useRemoteConfig();
        return <Text testID="url">{config.remote_urls["api_base"]}</Text>;
      }
      const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
      expect(getByTestId("url").props.children).toBe("https://api.rumik.app");
    });

    it("isLoading is true when status is loading", () => {
      mockClient.getStatus.mockReturnValue("loading");
      function TestComponent() {
        const { isLoading } = useRemoteConfig();
        return <Text testID="loading">{String(isLoading)}</Text>;
      }
      const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
      expect(getByTestId("loading").props.children).toBe("true");
    });

    it("isLoading is false when status is ready", () => {
      function TestComponent() {
        const { isLoading } = useRemoteConfig();
        return <Text testID="loading">{String(isLoading)}</Text>;
      }
      const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
      expect(getByTestId("loading").props.children).toBe("false");
    });

    it("setUserContext calls client.setUserContext and refresh", async () => {
      function TestComponent() {
        const { setUserContext } = useRemoteConfig();
        return (
          <Text
            testID="btn"
            onPress={() => setUserContext({ userId: "u1" })}
          />
        );
      }
      const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
      await act(async () => {
        getByTestId("btn").props.onPress();
      });
      expect(mockClient.setUserContext).toHaveBeenCalledWith({ userId: "u1" });
      expect(mockClient.refresh).toHaveBeenCalled();
    });

    it("returns stable snapshot reference when config has not changed", () => {
      const snapshots: unknown[] = [];
      function TestComponent() {
        const { config } = useRemoteConfig();
        snapshots.push(config);
        return null;
      }
      render(<TestComponent />, { wrapper: Wrapper });
      // Trigger a store change without changing the underlying raw config object
      act(() => { storeListener?.(); });
      // Both renders should have the same config reference
      expect(snapshots[0]).toBe(snapshots[snapshots.length - 1]);
    });
  });

  describe("useFlag", () => {
    it("returns true for an enabled flag", () => {
      function TestComponent() {
        const flag = useFlag("dark_mode");
        return <Text testID="f">{String(flag)}</Text>;
      }
      const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
      expect(getByTestId("f").props.children).toBe("true");
    });

    it("returns false for a disabled flag", () => {
      function TestComponent() {
        const flag = useFlag("new_ui");
        return <Text testID="f">{String(flag)}</Text>;
      }
      const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
      expect(getByTestId("f").props.children).toBe("false");
    });

    it("returns false for an unknown flag", () => {
      function TestComponent() {
        const flag = useFlag("unknown_flag");
        return <Text testID="f">{String(flag)}</Text>;
      }
      const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
      expect(getByTestId("f").props.children).toBe("false");
    });
  });

  describe("useExperimentVariant", () => {
    it("returns variant_id for a known experiment", () => {
      function TestComponent() {
        const variant = useExperimentVariant("onboarding");
        return <Text testID="v">{variant}</Text>;
      }
      const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
      expect(getByTestId("v").props.children).toBe("treatment");
    });

    it("returns null for an unknown experiment", () => {
      function TestComponent() {
        const variant = useExperimentVariant("unknown_exp");
        return <Text testID="v">{String(variant)}</Text>;
      }
      const { getByTestId } = render(<TestComponent />, { wrapper: Wrapper });
      expect(getByTestId("v").props.children).toBe("null");
    });
  });
});
