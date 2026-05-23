import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import type { DeezerTrack } from "./deezer";

interface PlayerState {
  track: DeezerTrack | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  play: (track: DeezerTrack) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
}

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [track, setTrack] = useState<DeezerTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  // Poll the player for position/duration updates every 250ms
  useEffect(() => {
    const interval = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      setPositionMs(p.currentTime * 1000);
      if (p.duration) setDurationMs(p.duration * 1000);
      setIsPlaying(p.playing);
    }, 250);
    return () => clearInterval(interval);
  }, []);

  const play = useCallback(async (newTrack: DeezerTrack) => {
    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
    }
    // playsInSilentMode: audio plays even when iPhone is silenced.
    // Wrapped in try-catch because Expo Go's pre-compiled native module may
    // not match the JS API version — safe to ignore in dev.
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
    } catch {
      // no-op in Expo Go; works correctly in EAS production builds
    }
    const p = createAudioPlayer({ uri: newTrack.preview });
    playerRef.current = p;
    setTrack(newTrack);
    setPositionMs(0);
    setIsPlaying(true);
    p.play();
  }, []);

  const pause = useCallback(async () => {
    playerRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(async () => {
    playerRef.current?.play();
    setIsPlaying(true);
  }, []);

  const seek = useCallback(async (ms: number) => {
    playerRef.current?.seekTo(ms / 1000);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        track,
        isPlaying,
        positionMs,
        durationMs,
        play,
        pause,
        resume,
        seek,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}
