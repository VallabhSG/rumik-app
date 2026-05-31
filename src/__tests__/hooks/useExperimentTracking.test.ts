import { renderHook, act } from "@testing-library/react-native";
import { useExperimentTracking } from "../../hooks/useExperimentTracking";

// ---------------------------------------------------------------------------
// Mock useRemoteConfigClient
// ---------------------------------------------------------------------------

const mockTrackExposure = jest.fn().mockResolvedValue(undefined);
const mockTrackConversion = jest.fn().mockResolvedValue(undefined);

jest.mock("../../hooks/useRemoteConfig", () => ({
  useRemoteConfigClient: () => ({
    trackExposure: mockTrackExposure,
    trackConversion: mockTrackConversion,
  }),
}));

describe("useExperimentTracking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("trackExposure", () => {
    it("calls client.trackExposure with correct payload", async () => {
      const { result } = renderHook(() =>
        useExperimentTracking("my_exp", "treatment"),
      );
      await act(async () => {
        await result.current.trackExposure("device-123", "user-456");
      });
      expect(mockTrackExposure).toHaveBeenCalledWith("my_exp", {
        install_id: "device-123",
        variant_id: "treatment",
        user_id: "user-456",
      });
    });

    it("calls trackExposure without userId when not provided", async () => {
      const { result } = renderHook(() =>
        useExperimentTracking("my_exp", "control"),
      );
      await act(async () => {
        await result.current.trackExposure("device-123");
      });
      expect(mockTrackExposure).toHaveBeenCalledWith("my_exp", {
        install_id: "device-123",
        variant_id: "control",
        user_id: undefined,
      });
    });

    it("does nothing when variantId is null", async () => {
      const { result } = renderHook(() =>
        useExperimentTracking("my_exp", null),
      );
      await act(async () => {
        await result.current.trackExposure("device-123");
      });
      expect(mockTrackExposure).not.toHaveBeenCalled();
    });

    it("swallows errors silently", async () => {
      mockTrackExposure.mockRejectedValueOnce(new Error("network error"));
      const { result } = renderHook(() =>
        useExperimentTracking("my_exp", "treatment"),
      );
      await expect(
        act(async () => {
          await result.current.trackExposure("device-123");
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("trackConversion", () => {
    it("calls client.trackConversion with correct payload", async () => {
      const { result } = renderHook(() =>
        useExperimentTracking("my_exp", "treatment"),
      );
      await act(async () => {
        await result.current.trackConversion("device-123", "purchase", 2, "user-456");
      });
      expect(mockTrackConversion).toHaveBeenCalledWith("my_exp", {
        install_id: "device-123",
        variant_id: "treatment",
        event_name: "purchase",
        value: 2,
        user_id: "user-456",
      });
    });

    it("uses default value of 1 when not provided", async () => {
      const { result } = renderHook(() =>
        useExperimentTracking("my_exp", "treatment"),
      );
      await act(async () => {
        await result.current.trackConversion("device-123", "purchase");
      });
      expect(mockTrackConversion).toHaveBeenCalledWith("my_exp", {
        install_id: "device-123",
        variant_id: "treatment",
        event_name: "purchase",
        value: 1,
        user_id: undefined,
      });
    });

    it("does nothing when variantId is null", async () => {
      const { result } = renderHook(() =>
        useExperimentTracking("my_exp", null),
      );
      await act(async () => {
        await result.current.trackConversion("device-123", "purchase");
      });
      expect(mockTrackConversion).not.toHaveBeenCalled();
    });

    it("swallows errors silently", async () => {
      mockTrackConversion.mockRejectedValueOnce(new Error("network error"));
      const { result } = renderHook(() =>
        useExperimentTracking("my_exp", "treatment"),
      );
      await expect(
        act(async () => {
          await result.current.trackConversion("device-123", "purchase");
        }),
      ).resolves.not.toThrow();
    });
  });
});
