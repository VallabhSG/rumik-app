import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import HomeScreen from "../../screens/HomeScreen";
import {
  useFeatureFlag,
  useKillSwitch,
  useExperiment,
} from "../../hooks/useRemoteConfig";
import { useOta } from "../../contexts/OtaContext";

// HomeScreen uses remote config hooks — mock them with safe defaults so
// unit tests don't need a real provider.
jest.mock("../../hooks/useRemoteConfig", () => ({
  useFeatureFlag: jest.fn(() => false),
  useKillSwitch: jest.fn(() => false),
  useExperiment: jest.fn(() => "control"),
  useDynamicUrl: jest.fn((_key: string, def: string) => def),
}));

jest.mock("../../contexts/OtaContext", () => ({
  useOta: jest.fn(() => ({
    status: "idle",
    error: null,
    download: jest.fn(),
    applyNow: jest.fn(),
  })),
}));

const mockUseFeatureFlag = useFeatureFlag as jest.Mock;
const mockUseKillSwitch = useKillSwitch as jest.Mock;
const mockUseExperiment = useExperiment as jest.Mock;
const mockUseOta = useOta as jest.Mock;

describe("HomeScreen", () => {
  it("renders logo and tagline", () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText("rumik")).toBeTruthy();
    expect(getByText("feel the music")).toBeTruthy();
  });

  it("renders Discover and Library cards", () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText("Discover")).toBeTruthy();
    expect(getByText("Library")).toBeTruthy();
  });

  it("renders recently played tracks", () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText("Neon Drift")).toBeTruthy();
    expect(getByText("Blue Static")).toBeTruthy();
    expect(getByText("Ultraviolet")).toBeTruthy();
  });

  it('calls onNavigate with "discover" when Discover card is pressed', () => {
    const onNavigate = jest.fn();
    const { getByTestId } = render(<HomeScreen onNavigate={onNavigate} />);
    fireEvent.press(getByTestId("discover-card"));
    expect(onNavigate).toHaveBeenCalledWith("discover");
  });

  it('calls onNavigate with "library" when Library card is pressed', () => {
    const onNavigate = jest.fn();
    const { getByTestId } = render(<HomeScreen onNavigate={onNavigate} />);
    fireEvent.press(getByTestId("library-card"));
    expect(onNavigate).toHaveBeenCalledWith("library");
  });

  it("renders track rows with correct testIDs", () => {
    const { getByTestId } = render(<HomeScreen />);
    expect(getByTestId("track-1")).toBeTruthy();
    expect(getByTestId("track-2")).toBeTruthy();
    expect(getByTestId("track-3")).toBeTruthy();
  });

  it("does not throw when onNavigate is not provided", () => {
    const { getByTestId } = render(<HomeScreen />);
    expect(() => fireEvent.press(getByTestId("discover-card"))).not.toThrow();
  });

  it("shows kill banner when checkout kill switch is active", () => {
    mockUseKillSwitch.mockReturnValueOnce(true);
    const { getByTestId } = render(<HomeScreen />);
    expect(getByTestId("kill-banner")).toBeTruthy();
  });

  it("shows new-releases section when feature flag is enabled", () => {
    mockUseFeatureFlag.mockImplementation(
      (key: string) => key === "new_releases",
    );
    const { getByTestId } = render(<HomeScreen />);
    expect(getByTestId("new-releases")).toBeTruthy();
  });

  it("shows new-onboarding banner when feature flag is enabled", () => {
    mockUseFeatureFlag.mockImplementation(
      (key: string) => key === "new_onboarding",
    );
    const { getByTestId } = render(<HomeScreen />);
    expect(getByTestId("new-onboarding")).toBeTruthy();
  });

  it("renders bold tagline when experiment variant is bold", () => {
    mockUseExperiment.mockReturnValueOnce("bold");
    const { getByText } = render(<HomeScreen />);
    expect(getByText("YOUR SOUND. YOUR WORLD.")).toBeTruthy();
  });

  it("shows ✦ NEW badge when OTA update is available", () => {
    mockUseOta.mockReturnValueOnce({
      status: "available",
      error: null,
      download: jest.fn(),
      applyNow: jest.fn(),
    });
    const { getByText } = render(<HomeScreen />);
    expect(getByText(/✦ NEW/)).toBeTruthy();
  });

  it("shows ✦ NEW badge when OTA update is ready", () => {
    mockUseOta.mockReturnValueOnce({
      status: "ready",
      error: null,
      download: jest.fn(),
      applyNow: jest.fn(),
    });
    const { getByText } = render(<HomeScreen />);
    expect(getByText(/✦ NEW/)).toBeTruthy();
  });
});
