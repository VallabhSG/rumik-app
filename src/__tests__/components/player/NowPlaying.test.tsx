import React from "react";
import { render, waitFor, act } from "@testing-library/react-native";
import type { Track } from "../../../services/tracks";

const mockTrack1: Track = {
  id: 1,
  title: "Neon Drift",
  artist: { id: 10, name: "Synthwave Radio", picture_medium: "" },
  album: { id: 100, title: "Test Album", cover_medium: "" },
  preview: "https://example.com/1.mp3",
  duration: 30,
};

const mockTrack2: Track = {
  ...mockTrack1,
  id: 2,
  title: "Second Track",
};

// Mutable current track — the usePlayer mock reads this so tests can switch tracks.
let mockCurrentTrack: Track | null = mockTrack1;
const mockIsDownloaded = jest.fn<Promise<boolean>, [number]>();

jest.mock("../../../services/player", () => ({
  usePlayer: () => ({
    track: mockCurrentTrack,
    isPlaying: false,
    positionMs: 0,
    durationMs: 1000,
    pause: jest.fn(),
    resume: jest.fn(),
    seek: jest.fn(),
  }),
}));

jest.mock("@clerk/clerk-expo", () => ({
  useUser: () => ({ user: { id: "user-1" } }),
}));

jest.mock("../../../services/library", () => ({
  toggleLike: jest.fn().mockResolvedValue(undefined),
  isLiked: jest.fn().mockResolvedValue(false),
}));

jest.mock("../../../contexts/RemoteConfigContext", () => ({
  useFlag: (key: string) => key === "enable_offline_mode",
  useExperimentVariant: () => "control",
}));

jest.mock("../../../services/offline", () => ({
  isDownloaded: (id: number) => mockIsDownloaded(id),
  downloadTrack: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
}));

import { NowPlaying } from "../../../components/player/NowPlaying";

// The first test in a jest-expo file pays a one-time module cold-start cost that,
// under coverage instrumentation on slower CI hardware, can exceed the default
// 5s test timeout. Give the async render/waitFor cycle generous headroom.
jest.setTimeout(20000);

const DOWNLOADED = "✓";
const IDLE = "⬇";

describe("NowPlaying download status", () => {
  beforeEach(() => {
    mockCurrentTrack = mockTrack1;
    mockIsDownloaded.mockReset();
  });

  it("shows the downloaded indicator when the track is already cached", async () => {
    mockIsDownloaded.mockImplementation(() => Promise.resolve(true));
    const { getByText } = render(<NowPlaying visible onClose={jest.fn()} />);
    await waitFor(() => expect(getByText(DOWNLOADED)).toBeTruthy());
  });

  it("resets to idle when the track changes to an uncached one", async () => {
    mockIsDownloaded.mockImplementation((id) => Promise.resolve(id === 1));
    const { getByText, queryByText, rerender } = render(
      <NowPlaying visible onClose={jest.fn()} />,
    );
    await waitFor(() => expect(getByText(DOWNLOADED)).toBeTruthy());

    mockCurrentTrack = mockTrack2;
    rerender(<NowPlaying visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByText(IDLE)).toBeTruthy());
    expect(queryByText(DOWNLOADED)).toBeNull();
  });

  it("ignores a stale isDownloaded result that resolves after the track switched", async () => {
    // Track 1's lookup never resolves until we trigger it; track 2 resolves false.
    let resolveTrack1: (v: boolean) => void = () => {};
    mockIsDownloaded.mockImplementation((id) =>
      id === 1
        ? new Promise<boolean>((resolve) => {
            resolveTrack1 = resolve;
          })
        : Promise.resolve(false),
    );

    const { getByText, queryByText, rerender } = render(
      <NowPlaying visible onClose={jest.fn()} />,
    );

    // Switch to track 2 before track 1's lookup resolves.
    mockCurrentTrack = mockTrack2;
    rerender(<NowPlaying visible onClose={jest.fn()} />);
    await waitFor(() => expect(getByText(IDLE)).toBeTruthy());

    // The stale track-1 lookup now resolves "downloaded" — it must be ignored.
    await act(async () => {
      resolveTrack1(true);
    });

    expect(queryByText(DOWNLOADED)).toBeNull();
  });
});
