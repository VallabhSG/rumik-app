import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { useFocusEffect } from 'expo-router';
import { TrackRow } from '../../src/components/track/TrackRow';
import { usePlayer } from '../../src/services/player';
import { getLiked, toggleLike, pushRecent, getRecent, type DeezerTrack } from '../../src/services/library';
import { Colors, Typography, Spacing, Radius } from '../../src/theme/tokens';

const TABS = ['Liked', 'Recent'] as const;
type Tab = typeof TABS[number];

export default function LibraryScreen() {
  const { user } = useUser();
  const userId = user?.id ?? '';
  const { play } = usePlayer();
  const [activeTab, setActiveTab] = useState<Tab>('Liked');
  const [liked, setLiked] = useState<DeezerTrack[]>([]);
  const [recent, setRecent] = useState<DeezerTrack[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [l, r] = await Promise.all([getLiked(userId), getRecent(userId)]);
    setLiked(l);
    setRecent(r);
  }, [userId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const handlePlay = async (track: DeezerTrack) => {
    await play(track);
    if (userId) await pushRecent(userId, track);
  };

  const handleLike = async (track: DeezerTrack) => {
    if (!userId) return;
    await toggleLike(userId, track);
    refresh();
  };

  const list = activeTab === 'Liked' ? liked : recent;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        <View style={styles.pills}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.pill, activeTab === tab && styles.pillActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.pillText, activeTab === tab && styles.pillTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {activeTab === 'Liked'
              ? 'Nothing liked yet. Tap ♥ on any track.'
              : 'No recently played tracks yet.'}
          </Text>
        }
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            onPlay={handlePlay}
            isLiked={activeTab === 'Liked' ? true : undefined}
            onLike={handleLike}
            showLike={activeTab === 'Liked'}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  pills: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm },
  pill: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  pillActive: { backgroundColor: Colors.accent },
  pillText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  pillTextActive: { color: Colors.white },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  empty: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xl * 2,
  },
});
