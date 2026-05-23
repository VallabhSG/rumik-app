import { renderHook, act } from "@testing-library/react-native";
import { PlayerProvider, usePlayer } from "../../services/player";
import React from "react";

jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

import { createAudioPlayer } from "expo-audio";

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(),
  remove: jest.fn(),
  playing: false,
  currentTime: 0,
  duration: 30,
};

const mockTrack = {
  id: 1,
  title: "Test",
  artist: { id: 1, name: "Artist", picture_medium: "" },
  album: { id: 1, title: "Album", cover_medium: "" },
  preview: "https://example.com/p.mp3",
  duration: 30,
};

beforeEach(() => {
  jest.clearAllMocks();
  (createAudioPlayer as jest.Mock).mockReturnValue({ ...mockPlayer });
});

describe("usePlayer", () => {
  it("starts with no track", () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: ({ children }) =>
        React.createElement(PlayerProvider, null, children),
    });
    expect(result.current.track).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it("play() sets the current track", async () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: ({ children }) =>
        React.createElement(PlayerProvider, null, children),
    });
    await act(async () => {
      await result.current.play(mockTrack);
    });
    expect(result.current.track?.id).toBe(1);
  });

  it("pause() sets isPlaying to false", async () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: ({ children }) =>
        React.createElement(PlayerProvider, null, children),
    });
    await act(async () => {
      await result.current.play(mockTrack);
    });
    await act(async () => {
      await result.current.pause();
    });
    expect(result.current.isPlaying).toBe(false);
  });
});
