import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Share } from "react-native";
import { Colors, Typography, Spacing, Radius } from "../../theme/tokens";
import type { DeezerTrack } from "../../services/deezer";
import { useFlag } from "../../contexts/RemoteConfigContext";

interface Props {
  track: DeezerTrack;
  onPlay: (track: DeezerTrack) => void;
  rank?: number;
  isLiked?: boolean;
  onLike?: (track: DeezerTrack) => void;
  showLike?: boolean;
}

async function handleShare(trackName: string, artistName: string): Promise<void> {
  await Share.share({
    message: `🎵 Listening to "${trackName}" by ${artistName} on Rumik`,
  });
}

export function TrackRow({
  track,
  onPlay,
  rank,
  isLiked,
  onLike,
  showLike,
}: Props) {
  const enableSocialShare = useFlag("enable_social_share");
  return (
    <View style={styles.row}>
      {rank !== undefined && <Text style={styles.rank}>#{rank}</Text>}
      <Image source={{ uri: track.album.cover_medium }} style={styles.thumb} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist.name}
        </Text>
      </View>
      {showLike && onLike && (
        <TouchableOpacity
          onPress={() => onLike(track)}
          style={styles.action}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.heart, isLiked && styles.heartActive]}>♥</Text>
        </TouchableOpacity>
      )}
      {enableSocialShare && (
        <TouchableOpacity
          onPress={() => handleShare(track.title, track.artist.name)}
          style={styles.action}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.shareIcon}>⬆️</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={() => onPlay(track)}
        style={styles.action}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.playIcon}>▶</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rank: { ...Typography.label, color: Colors.accent, width: 24 },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    marginRight: Spacing.sm,
    backgroundColor: Colors.muted,
  },
  info: { flex: 1, marginRight: Spacing.xs },
  title: { ...Typography.body, color: Colors.text },
  artist: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  action: { paddingHorizontal: Spacing.xs },
  playIcon: { fontSize: 14, color: Colors.accent },
  shareIcon: { fontSize: 18 },
  heart: { fontSize: 16, color: Colors.muted },
  heartActive: { color: Colors.accent },
});
