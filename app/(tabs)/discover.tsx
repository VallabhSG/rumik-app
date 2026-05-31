import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser } from "@clerk/clerk-expo";
import { SectionLabel } from "../../src/components/ui/SectionLabel";
import { TrackRow } from "../../src/components/track/TrackRow";
import { usePlayer } from "../../src/services/player";
import { useMiniPlayerPadding } from "../../src/hooks/useMiniPlayerPadding";
import { searchTracks, getCharts, type Track } from "../../src/services/tracks";
import { pushRecent, toggleLike, isLiked } from "../../src/services/library";
import { Colors, Typography, Spacing, Radius } from "../../src/theme/tokens";
import { useKillSwitch } from "../../src/hooks/useRemoteConfig";
import { useExperimentVariant } from "../../src/contexts/RemoteConfigContext";

export default function DiscoverScreen() {
  const { play } = usePlayer();
  const miniPlayerPadding = useMiniPlayerPadding();
  const searchDisabled = useKillSwitch("disable_search");
  const searchPromptVariant = useExperimentVariant("search_prompt_copy");
  const { user } = useUser();
  const userId = user?.id ?? "";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [charts, setCharts] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getCharts(20).then(setCharts);
  }, []);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const found = await searchTracks(text);
      setResults(found);
      setLoading(false);
    }, 300);
  }, []);

  const handlePlay = async (track: Track) => {
    await play(track);
    if (userId) await pushRecent(userId, track);
  };

  const handleLike = async (track: Track) => {
    if (!userId) return;
    await toggleLike(userId, track);
    const liked = await isLiked(userId, track.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (liked) {
        next.add(track.id);
      } else {
        next.delete(track.id);
      }
      return next;
    });
  };

  const displayList = query.length >= 2 ? results : charts;
  const showEmpty = query.length >= 2 && !loading && results.length === 0;

  return (
    <SafeAreaView style={styles.safe}>
      {searchDisabled && (
        <View style={styles.killBanner}>
          <Text style={styles.killBannerText}>
            🔧 Search is temporarily unavailable. Check back soon.
          </Text>
        </View>
      )}
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={
              searchPromptVariant === "variant_a"
                ? "What are you feeling like?"
                : "Search artists, tracks…"
            }
            placeholderTextColor={Colors.textSecondary}
            value={query}
            onChangeText={handleSearch}
            autoCapitalize="none"
          />
        </View>
      </View>
      {!searchDisabled && loading && (
        <ActivityIndicator
          color={Colors.accent}
          style={{ marginTop: Spacing.md }}
        />
      )}
      {showEmpty && (
        <Text style={styles.empty}>{`No results for "${query}"`}</Text>
      )}
      <FlatList
        data={displayList}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Spacing.xl + miniPlayerPadding },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <SectionLabel>
            {query.length >= 2 ? "RESULTS" : "CHARTS"}
          </SectionLabel>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            onPlay={handlePlay}
            rank={query.length < 2 ? index + 1 : undefined}
            isLiked={likedIds.has(item.id)}
            onLike={handleLike}
            showLike
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  killBanner: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  killBannerText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchIcon: { fontSize: 14, marginRight: Spacing.xs },
  searchInput: {
    flex: 1,
    padding: Spacing.sm,
    ...Typography.body,
    color: Colors.text,
  },
  list: { paddingHorizontal: Spacing.lg },
  empty: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: Spacing.xl,
  },
});
