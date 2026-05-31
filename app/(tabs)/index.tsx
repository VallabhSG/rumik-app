import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser } from "@clerk/clerk-expo";
import { SectionLabel } from "../../src/components/ui/SectionLabel";
import { TrackRow } from "../../src/components/track/TrackRow";
import { TrackCard } from "../../src/components/track/TrackCard";
import { usePlayer } from "../../src/services/player";
import { getCharts, searchTracks, type Track } from "../../src/services/tracks";
import {
  getRecent,
  pushRecent,
  toggleLike,
  isLiked,
} from "../../src/services/library";
import { Colors, Typography, Spacing, Radius } from "../../src/theme/tokens";
import { useMiniPlayerPadding } from "../../src/hooks/useMiniPlayerPadding";
import { useFeatureFlag, useExperiment } from "../../src/hooks/useRemoteConfig";
import { Pill } from "../../src/components/ui/Pill";
import { PremiumUpsellCard } from "../../src/components/PremiumUpsellCard";

const GENRE_QUERIES: Record<string, string> = {
  All: "",
  Pop: "top pop hits",
  "Hip-Hop": "top hip hop",
  Electronic: "top electronic",
  "R&B": "top r&b soul",
};

export default function HomeScreen() {
  const { user } = useUser();
  const { play } = usePlayer();
  const [charts, setCharts] = useState<Track[]>([]);
  const [recent, setRecent] = useState<Track[]>([]);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const miniPlayerPadding = useMiniPlayerPadding();
  const showGenrePills = useFeatureFlag("show_genre_pills");
  const showPremiumUpsell = useFeatureFlag("show_premium_upsell");
  const showNewReleases = useFeatureFlag("new_releases");
  const [newReleases, setNewReleases] = useState<Track[]>([]);
  const greetingStyle = useExperiment("tagline_test", "control");
  const chartLimit = parseInt(useExperiment("chart_limit", "8"), 10);
  const homeLayout = useExperiment("home_layout", "control");
  const [activeGenre, setActiveGenre] = useState<string>("All");

  const userId = user?.id ?? "";

  useEffect(() => {
    const query = GENRE_QUERIES[activeGenre];
    const fetchFn = query ? searchTracks(query, 20) : getCharts();
    fetchFn.then((tracks) => {
      setCharts(tracks);
      setLoading(false);
    });
  }, [activeGenre]);

  const handleGenreSelect = (genre: string) => {
    if (genre === activeGenre) return;
    setActiveGenre(genre);
    setLoading(true);
  };

  useEffect(() => {
    if (!userId) return;
    getRecent(userId).then(setRecent);
  }, [userId]);

  useEffect(() => {
    if (!showNewReleases) return;
    searchTracks("new music releases", 10).then(setNewReleases);
  }, [showNewReleases]);

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

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const featured = charts[0];
  const chartList = charts.slice(1, chartLimit);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Spacing.xl + miniPlayerPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {greeting}
              {user?.firstName ? `, ${user.firstName}` : ""}
            </Text>
            <Text
              style={[
                styles.wordmark,
                greetingStyle === "bold" && styles.wordmarkBold,
              ]}
            >
              rumik
            </Text>
            {(greetingStyle === "tagline_feel" ||
              greetingStyle === "tagline_sound") && (
              <Text style={styles.tagline}>
                {greetingStyle === "tagline_feel"
                  ? "feel the music"
                  : "your sound, your way"}
              </Text>
            )}
          </View>
        </View>

        {showGenrePills && (
          <View style={styles.genrePills}>
            {["All", "Pop", "Hip-Hop", "Electronic", "R&B"].map((g) => (
              <TouchableOpacity key={g} onPress={() => handleGenreSelect(g)}>
                <Pill label={g} active={activeGenre === g} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading && (
          <ActivityIndicator
            color={Colors.accent}
            style={{ marginTop: Spacing.xl }}
          />
        )}

        {recent.length > 0 && (
          <>
            <SectionLabel>RECENTLY PLAYED</SectionLabel>
            {recent.slice(0, 5).map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                onPlay={handlePlay}
                isLiked={likedIds.has(track.id)}
                onLike={handleLike}
                showLike
              />
            ))}
          </>
        )}

        {showNewReleases && newReleases.length > 0 && (
          <>
            <SectionLabel>NEW RELEASES</SectionLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.newReleasesScroll}
            >
              {newReleases.map((track) => (
                <TouchableOpacity
                  key={track.id}
                  style={styles.releaseCard}
                  onPress={() => handlePlay(track)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: track.album.cover_medium }}
                    style={styles.releaseCover}
                  />
                  <Text style={styles.releaseTitle} numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text style={styles.releaseArtist} numberOfLines={1}>
                    {track.artist.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {featured && (
          <>
            <SectionLabel>FEATURED</SectionLabel>
            <TrackCard
              track={featured}
              onPlay={handlePlay}
              label="NEW RELEASE"
            />
          </>
        )}

        {showPremiumUpsell && <PremiumUpsellCard />}

        {chartList.length > 0 && (
          <>
            <SectionLabel>CHARTS</SectionLabel>

            {homeLayout === "grid" && (
              <View style={styles.grid}>
                {chartList.map((track, i) => (
                  <TouchableOpacity
                    key={track.id}
                    style={styles.gridCell}
                    onPress={() => handlePlay(track)}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: track.album.cover_medium }}
                      style={styles.gridCover}
                    />
                    <Text style={styles.gridRank}>#{i + 2}</Text>
                    <Text style={styles.gridTitle} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={styles.gridArtist} numberOfLines={1}>
                      {track.artist.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {homeLayout === "horizontal" && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScroll}
              >
                {chartList.map((track, i) => (
                  <TouchableOpacity
                    key={track.id}
                    style={styles.horizontalCard}
                    onPress={() => handlePlay(track)}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: track.album.cover_medium }}
                      style={styles.horizontalCover}
                    />
                    <Text style={styles.gridRank}>#{i + 2}</Text>
                    <Text style={styles.gridTitle} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={styles.gridArtist} numberOfLines={1}>
                      {track.artist.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {(homeLayout === "control" ||
              !["grid", "horizontal"].includes(homeLayout)) &&
              chartList.map((track, i) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  onPlay={handlePlay}
                  rank={i + 2}
                  isLiked={likedIds.has(track.id)}
                  onLike={handleLike}
                  showLike
                />
              ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: Spacing.lg,
  },
  greeting: { ...Typography.label, color: Colors.textSecondary },
  wordmark: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -1,
    color: Colors.text,
    marginTop: 2,
  },
  wordmarkBold: { fontSize: 38, letterSpacing: -2 },
  tagline: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  genrePills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: Spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  gridCell: {
    width: "48%",
  },
  gridCover: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.muted,
    marginBottom: 4,
  },
  gridRank: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.accent,
    fontWeight: "700",
  },
  gridTitle: {
    ...Typography.body,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.text,
  },
  gridArtist: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  horizontalScroll: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  horizontalCard: {
    width: 130,
  },
  horizontalCover: {
    width: 130,
    height: 130,
    borderRadius: Radius.md,
    backgroundColor: Colors.muted,
    marginBottom: 4,
  },
  newReleasesScroll: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  releaseCard: {
    width: 120,
  },
  releaseCover: {
    width: 120,
    height: 120,
    borderRadius: Radius.md,
    backgroundColor: Colors.muted,
    marginBottom: 6,
  },
  releaseTitle: {
    ...Typography.body,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.text,
  },
  releaseArtist: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
});
