import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { usePlayer } from "../../services/player";
import { Colors, Typography, Spacing, Radius } from "../../theme/tokens";

interface Props {
  onExpand: () => void;
}

export function MiniPlayer({ onExpand }: Props) {
  const { track, isPlaying, positionMs, durationMs, pause, resume } =
    usePlayer();
  if (!track) return null;

  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onExpand}
      activeOpacity={0.95}
    >
      <Image source={{ uri: track.album.cover_medium }} style={styles.art} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title} — {track.artist.name}
        </Text>
        <View style={styles.bar}>
          <View
            style={[
              styles.progress,
              { width: `${progress * 100}%` as `${number}%` },
            ]}
          />
        </View>
      </View>
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          if (isPlaying) {
            pause();
          } else {
            resume();
          }
        }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.control}>{isPlaying ? "⏸" : "▶"}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  art: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.muted,
  },
  info: { flex: 1 },
  title: { ...Typography.caption, color: Colors.text, fontWeight: "600" },
  bar: {
    height: 2,
    backgroundColor: Colors.muted,
    borderRadius: 2,
    marginTop: 5,
    overflow: "hidden",
  },
  progress: { height: "100%", backgroundColor: Colors.accent, borderRadius: 2 },
  control: { fontSize: 18, color: Colors.accent, paddingLeft: Spacing.xs },
});
