import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../theme/tokens';
import type { DeezerTrack } from '../../services/deezer';

interface Props {
  track: DeezerTrack;
  onPlay: (track: DeezerTrack) => void;
  label?: string;
}

export function TrackCard({ track, onPlay, label }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPlay(track)} activeOpacity={0.85}>
      <Image source={{ uri: track.album.cover_medium }} style={styles.art} />
      <View style={styles.info}>
        {label && <Text style={styles.label}>{label}</Text>}
        <Text style={styles.title} numberOfLines={2}>{track.title}</Text>
        <Text style={styles.artist}>{track.artist.name}</Text>
      </View>
      <Text style={styles.play}>▶</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  art: { width: 56, height: 56, borderRadius: Radius.md, backgroundColor: Colors.muted },
  info: { flex: 1 },
  label: { ...Typography.label, color: Colors.accent, marginBottom: 3 },
  title: { ...Typography.title, color: Colors.text },
  artist: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  play: { fontSize: 16, color: Colors.accent },
});
