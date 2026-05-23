import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { TrackRow } from "../../../components/track/TrackRow";
import type { DeezerTrack } from "../../../services/deezer";

const mockTrack: DeezerTrack = {
  id: 1,
  title: "Neon Drift",
  artist: { id: 10, name: "Synthwave Radio", picture_medium: "" },
  album: { id: 100, title: "Test Album", cover_medium: "" },
  preview: "https://example.com/preview.mp3",
  duration: 30,
};

describe("TrackRow", () => {
  it("renders track title and artist", () => {
    const { getByText } = render(
      <TrackRow track={mockTrack} onPlay={jest.fn()} />,
    );
    expect(getByText("Neon Drift")).toBeTruthy();
    expect(getByText("Synthwave Radio")).toBeTruthy();
  });

  it("calls onPlay when play button tapped", () => {
    const onPlay = jest.fn();
    const { getByText } = render(
      <TrackRow track={mockTrack} onPlay={onPlay} />,
    );
    fireEvent.press(getByText("▶"));
    expect(onPlay).toHaveBeenCalledWith(mockTrack);
  });

  it("shows rank when provided", () => {
    const { getByText } = render(
      <TrackRow track={mockTrack} onPlay={jest.fn()} rank={1} />,
    );
    expect(getByText("#1")).toBeTruthy();
  });
});
