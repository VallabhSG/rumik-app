import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import HomeScreen from "../../screens/HomeScreen";

// HomeScreen uses remote config hooks — mock them with safe defaults so
// unit tests don't need a real provider.
jest.mock("../../hooks/useRemoteConfig", () => ({
  useFeatureFlag: jest.fn(() => false),
  useKillSwitch: jest.fn(() => false),
}));

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
});
