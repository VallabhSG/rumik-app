import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { Audio } from 'expo-av';
import type { DeezerTrack } from './deezer';

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
  const soundRef = useRef<Audio.Sound | null>(null);
  const [track, setTrack] = useState<DeezerTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  const unloadCurrent = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
  }, []);

  const play = useCallback(async (newTrack: DeezerTrack) => {
    await unloadCurrent();
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound, status } = await Audio.Sound.createAsync(
      { uri: newTrack.preview },
      { shouldPlay: true }
    );
    soundRef.current = sound;
    setTrack(newTrack);
    setIsPlaying(true);
    if (status.isLoaded && status.durationMillis) {
      setDurationMs(status.durationMillis);
    }
    sound.setOnPlaybackStatusUpdate((s) => {
      if (!s.isLoaded) return;
      setPositionMs(s.positionMillis ?? 0);
      setIsPlaying(s.isPlaying);
      if (s.didJustFinish) setIsPlaying(false);
    });
  }, [unloadCurrent]);

  const pause = useCallback(async () => {
    await soundRef.current?.pauseAsync();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(async () => {
    await soundRef.current?.playAsync();
    setIsPlaying(true);
  }, []);

  const seek = useCallback(async (ms: number) => {
    await soundRef.current?.setPositionAsync(ms);
  }, []);

  return (
    <PlayerContext.Provider value={{ track, isPlaying, positionMs, durationMs, play, pause, resume, seek }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}
