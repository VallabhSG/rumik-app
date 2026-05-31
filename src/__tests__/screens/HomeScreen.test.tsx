import React from "react";
import { render } from "@testing-library/react-native";
import HomeScreen from "../../../app/(tabs)/index";

jest.mock("@clerk/clerk-expo", () => ({
  useUser: () => ({
    user: {
      id: "user-1",
      firstName: "Test",
      primaryEmailAddress: null,
      imageUrl: null,
      publicMetadata: {},
    },
  }),
}));

jest.mock("../../services/tracks", () => ({
  getCharts: jest.fn().mockResolvedValue([]),
  searchTracks: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../services/library", () => ({
  getRecent: jest.fn().mockResolvedValue([]),
  pushRecent: jest.fn().mockResolvedValue(undefined),
  toggleLike: jest.fn().mockResolvedValue(undefined),
  isLiked: jest.fn().mockResolvedValue(false),
}));

jest.mock("../../services/player", () => ({
  usePlayer: () => ({ play: jest.fn() }),
}));

jest.mock("../../hooks/useMiniPlayerPadding", () => ({
  useMiniPlayerPadding: () => 0,
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    SafeAreaView: ({
      children,
      ...props
    }: React.ComponentProps<typeof View>) => <View {...props}>{children}</View>,
  };
});

jest.mock("../../components/ui/SectionLabel", () => ({
  SectionLabel: () => null,
}));

jest.mock("../../components/track/TrackRow", () => ({
  TrackRow: () => null,
}));

jest.mock("../../components/track/TrackCard", () => ({
  TrackCard: () => null,
}));

jest.mock("../../components/PremiumUpsellCard", () => ({
  PremiumUpsellCard: () => null,
}));

jest.mock("../../components/ui/Pill", () => ({
  Pill: () => null,
}));

jest.mock("../../hooks/useRemoteConfig", () => ({
  useFeatureFlag: jest.fn().mockReturnValue(false),
  useExperiment: jest.fn(),
}));

const mockUseExperiment = jest.requireMock("../../hooks/useRemoteConfig")
  .useExperiment as jest.Mock;

function setupExperiment(taglineVariant: string) {
  mockUseExperiment.mockImplementation((key: string, defaultValue: string) => {
    if (key === "tagline_test") return taglineVariant;
    if (key === "chart_limit") return "8";
    if (key === "home_layout") return "control";
    return defaultValue;
  });
}

describe("HomeScreen tagline variants", () => {
  beforeEach(() => {
    setupExperiment("control");
  });

  it("control: renders wordmark without tagline", () => {
    const { getByText, queryByText } = render(<HomeScreen />);
    expect(getByText("rumik")).toBeTruthy();
    expect(queryByText("feel the music")).toBeNull();
    expect(queryByText("your sound, your way")).toBeNull();
  });

  it("bold: applies bold style to wordmark without rendering tagline text", () => {
    setupExperiment("bold");
    const { getByText, queryByText } = render(<HomeScreen />);
    expect(getByText("rumik")).toBeTruthy();
    expect(queryByText("feel the music")).toBeNull();
    expect(queryByText("your sound, your way")).toBeNull();
  });

  it("tagline_feel: renders 'feel the music' below wordmark", () => {
    setupExperiment("tagline_feel");
    const { getByText } = render(<HomeScreen />);
    expect(getByText("rumik")).toBeTruthy();
    expect(getByText("feel the music")).toBeTruthy();
  });

  it("tagline_sound: renders 'your sound, your way' below wordmark", () => {
    setupExperiment("tagline_sound");
    const { getByText } = render(<HomeScreen />);
    expect(getByText("rumik")).toBeTruthy();
    expect(getByText("your sound, your way")).toBeTruthy();
  });
});
