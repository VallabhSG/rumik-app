import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, Image, TouchableOpacity, StyleSheet,
  Dimensions, PanResponder,
} from 'react-native';
import { usePlayer } from '../../services/player';
import { useUser } from '@clerk/clerk-expo';
import { toggleLike, isLiked as checkIsLiked } from '../../services/library';
import { Colors, Typography, Spacing, Radius } from '../../theme/tokens';

const { width } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function NowPlaying({ visible, onClose }: Props) {
  const { track, isPlaying, positionMs, durationMs, pause, resume, seek } = usePlayer();
  const { user } = useUser();
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (track && user?.id) {
      checkIsLiked(user.id, track.id).then(setLiked);
    }
  }, [track?.id, user?.id]);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
    onPanResponderRelease: (_, g) => { if (g.dy > 60) onClose(); },
  });

  const handleLike = async () => {
    if (!track || !user?.id) return;
    await toggleLike(user.id, track);
    setLiked((prev) => !prev);
  };

  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const scrubberWidth = width - Spacing.xl * 2;

  if (!track) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container} {...panResponder.panHandlers}>
        <View style={styles.handle} />

        <Image source={{ uri: track.album.cover_medium }} style={styles.art} />

        <View style={styles.info}>
          <Text style={styles.title}>{track.title}</Text>
          <Text style={styles.artist}>{track.artist.name}</Text>
          <Text style={styles.album}>{track.album.title}</Text>
        </View>

        <TouchableOpacity
          style={[styles.scrubberTrack, { width: scrubberWidth }]}
          onPress={(e) => {
            const tapX = e.nativeEvent.locationX;
            seek(Math.round((tapX / scrubberWidth) * durationMs));
          }}
          activeOpacity={1}
        >
          <View style={[styles.scrubberFill, { width: `${progress * 100}%` as `${number}%` }]} />
        </TouchableOpacity>
        <View style={styles.times}>
          <Text style={styles.time}>{formatMs(positionMs)}</Text>
          <Text style={styles.time}>{formatMs(durationMs)}</Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity onPress={handleLike} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[styles.action, liked && styles.actionActive]}>♥</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.playBtn} onPress={isPlaying ? pause : resume}>
            <Text style={styles.playBtnIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  handle: { width: 36, height: 4, backgroundColor: Colors.muted, borderRadius: 2, marginBottom: Spacing.xl },
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
  info: { alignItems: 'center', marginTop: Spacing.xl, marginBottom: Spacing.lg },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: Colors.text, textAlign: 'center' },
  artist: { ...Typography.body, color: Colors.textSecondary, marginTop: 4 },
  album: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  scrubberTrack: {
    height: 4,
    backgroundColor: Colors.muted,
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  scrubberFill: { position: 'absolute', height: '100%', backgroundColor: Colors.accent, borderRadius: 2 },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: Spacing.xs,
  },
  time: { ...Typography.caption, color: Colors.textMuted },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginTop: Spacing.xl,
  },
  action: { fontSize: 24, color: Colors.muted },
  actionActive: { color: Colors.accent },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accentDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  playBtnIcon: { fontSize: 24, color: Colors.white },
});
