import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  PanResponder,
  Linking,
  ActivityIndicator,
} from "react-native";
import { usePlayer } from "../../services/player";
import { useUser } from "@clerk/clerk-expo";
import { toggleLike, isLiked as checkIsLiked } from "../../services/library";
import { Colors, Typography, Spacing, Radius } from "../../theme/tokens";
import {
  useFlag,
  useExperimentVariant,
} from "../../contexts/RemoteConfigContext";
import { downloadTrack, isDownloaded } from "../../services/offline";
import * as Haptics from "expo-haptics";

type DownloadStatus = "idle" | "downloading" | "downloaded";

const { width } = Dimensions.get("window");

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function NowPlaying({ visible, onClose }: Props) {
  const { track, isPlaying, positionMs, durationMs, pause, resume, seek } =
    usePlayer();
  const { user } = useUser();
  const [liked, setLiked] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const trackId = track?.id;
  const enableLyricsLink = useFlag("enable_lyrics_link");
  const enableOfflineMode = useFlag("enable_offline_mode");
  const hapticsEnabled = useFlag("ios_exclusive_feature");
  const playerUiVariant = useExperimentVariant("player_ui");
  const isImmersive = playerUiVariant === "immersive";

  useEffect(() => {
    if (track && user?.id) {
      checkIsLiked(user.id, track.id).then(setLiked);
    }
  }, [track, user?.id]);

  // Reset download UI synchronously when the track changes. Render-phase reset
  // is React's recommended pattern for deriving state from props — it avoids the
  // extra render an effect-based reset would cause.
  const [lastTrackId, setLastTrackId] = useState<number | undefined>(trackId);
  if (trackId !== lastTrackId) {
    setLastTrackId(trackId);
    setDownloadStatus("idle");
    setDownloadProgress(0);
  }

  useEffect(() => {
    if (!trackId) return;
    let cancelled = false;
    isDownloaded(trackId).then((already) => {
      if (already && !cancelled) setDownloadStatus("downloaded");
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
    onPanResponderRelease: (_, g) => {
      if (g.dy > 60) onClose();
    },
  });

  const handleLike = async () => {
    if (!track || !user?.id) return;
    await toggleLike(user.id, track);
    setLiked((prev) => !prev);
    if (hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const scrubberWidth = width - Spacing.xl * 2;

  if (!track) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[styles.container, isImmersive && styles.containerImmersive]}
        {...panResponder.panHandlers}
      >
        <View style={styles.handle} />

        <Image
          source={{ uri: track.album.cover_medium }}
          style={[styles.art, isImmersive && styles.artImmersive]}
        />

        <View style={styles.info}>
          <Text style={styles.title}>{track.title}</Text>
          <Text style={styles.artist}>{track.artist.name}</Text>
          <Text style={styles.album}>{track.album.title}</Text>
          {enableLyricsLink && (
            <TouchableOpacity
              onPress={() => {
                const lyricsUrl = `https://genius.com/search?q=${encodeURIComponent(
                  track.title + " " + track.artist.name,
                )}`;
                void Linking.openURL(lyricsUrl);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.lyricsLink}>View Lyrics</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.scrubberTrack, { width: scrubberWidth }]}
          onPress={(e) => {
            const tapX = e.nativeEvent.locationX;
            seek(Math.round((tapX / scrubberWidth) * durationMs));
          }}
          activeOpacity={1}
        >
          <View
            style={[
              styles.scrubberFill,
              { width: `${progress * 100}%` as `${number}%` },
            ]}
          />
        </TouchableOpacity>
        <View style={styles.times}>
          <Text style={styles.time}>{formatMs(positionMs)}</Text>
          <Text style={styles.time}>{formatMs(durationMs)}</Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            onPress={handleLike}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.action, liked && styles.actionActive]}>♥</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.playBtn}
            onPress={isPlaying ? pause : resume}
          >
            <Text style={styles.playBtnIcon}>{isPlaying ? "⏸" : "▶"}</Text>
          </TouchableOpacity>
          {enableOfflineMode && (
            <TouchableOpacity
              onPress={async () => {
                if (downloadStatus !== "idle") return;
                setDownloadStatus("downloading");
                setDownloadProgress(0);
                try {
                  await downloadTrack(track, (p) => setDownloadProgress(p));
                  setDownloadStatus("downloaded");
                } catch {
                  setDownloadStatus("idle");
                }
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              disabled={downloadStatus !== "idle"}
            >
              {downloadStatus === "downloading" ? (
                <View style={styles.downloadingWrap}>
                  <ActivityIndicator size="small" color={Colors.accent} />
                  <Text style={styles.downloadPct}>
                    {Math.round(downloadProgress * 100)}%
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    styles.action,
                    downloadStatus === "downloaded" && styles.actionActive,
                  ]}
                >
                  {downloadStatus === "downloaded" ? "✓" : "⬇"}
                </Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.action}>↓</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.muted,
    borderRadius: 2,
    marginBottom: Spacing.xl,
  },
  art: {
    width: width * 0.72,
    height: width * 0.72,
    borderRadius: Radius.lg,
    backgroundColor: Colors.muted,
    shadowColor: Colors.accentDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  info: {
    alignItems: "center",
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: Colors.text,
    textAlign: "center",
  },
  artist: { ...Typography.body, color: Colors.textSecondary, marginTop: 4 },
  album: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  lyricsLink: { color: "#6C3CF7", fontSize: 14, marginTop: 8 },
  containerImmersive: {
    backgroundColor: "#000000",
  },
  artImmersive: {
    width: width * 0.88,
    height: width * 0.88,
    borderRadius: 24,
    shadowOpacity: 0.45,
    shadowRadius: 40,
  },
  scrubberTrack: {
    height: 4,
    backgroundColor: Colors.muted,
    borderRadius: 2,
    overflow: "hidden",
    position: "relative",
  },
  scrubberFill: {
    position: "absolute",
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: Spacing.xs,
  },
  time: { ...Typography.caption, color: Colors.textMuted },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xl,
    marginTop: Spacing.xl,
  },
  action: { fontSize: 24, color: Colors.muted },
  actionActive: { color: Colors.accent },
  downloadingWrap: { alignItems: "center", gap: 2 },
  downloadPct: { fontSize: 9, color: Colors.accent, fontWeight: "700" },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.accentDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  playBtnIcon: { fontSize: 24, color: Colors.white },
});
