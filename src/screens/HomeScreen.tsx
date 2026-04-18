import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from "react-native";
import Constants from "expo-constants";
import { useFeatureFlag, useKillSwitch, useExperiment, useDynamicUrl } from "../hooks/useRemoteConfig";
import { useOta } from "../contexts/OtaContext";

interface Props {
  onNavigate?: (screen: string) => void;
}

export default function HomeScreen({ onNavigate }: Props) {
  // ── Remote config demo ──────────────────────────────────────────────────
  // Toggle "new_releases" in the admin dashboard to show/hide this section.
  const { status: otaStatus } = useOta();
  const showNewReleases = useFeatureFlag("new_releases", false);
  const showNewOnboarding = useFeatureFlag("new_onboarding", false);
  const taglineVariant = useExperiment("tagline_test", "control");
  const apiUrl = useDynamicUrl("api_base_url", "https://api.rumik.app/v1");
  // Activate "checkout" kill switch in the admin to show the maintenance banner.
  const checkoutKilled = useKillSwitch("checkout");
  // ────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.header, taglineVariant === "bold" && styles.headerBold]}>
          <View style={styles.versionBadge}>
            <Text style={styles.versionBadgeText}>
              v{Constants.expoConfig?.version ?? "—"}
              {(otaStatus === "available" || otaStatus === "ready") ? " ✦ NEW" : ""}
            </Text>
          </View>
          <Text style={[styles.logo, taglineVariant === "bold" && styles.logoBold]}>rumik</Text>
          <Text style={[styles.tagline, taglineVariant === "bold" && styles.taglineBold]}>
            {taglineVariant === "bold" ? "YOUR SOUND. YOUR WORLD." : "feel the music"}
          </Text>
          <Text style={styles.variantBadge}>
            {taglineVariant === "bold" ? "🅱 bold variant" : "🅰 control variant"}
          </Text>
        </View>

        <View style={styles.cards}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => onNavigate?.("discover")}
            testID="discover-card"
          >
            <Text style={styles.cardTitle}>Discover</Text>
            <Text style={styles.cardSubtitle}>Find new sounds</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, styles.cardAccent]}
            onPress={() => onNavigate?.("library")}
            testID="library-card"
          >
            <Text style={styles.cardTitle}>Library</Text>
            <Text style={styles.cardSubtitle}>Your collection</Text>
          </TouchableOpacity>
        </View>

        {/* Feature flag — enable "new_onboarding" in the admin to reveal */}
        {showNewOnboarding && (
          <View style={styles.onboardingBanner} testID="new-onboarding">
            <Text style={styles.onboardingTitle}>✨ New Experience</Text>
            <Text style={styles.onboardingText}>
              We've redesigned your onboarding. Tap to explore the new flow.
            </Text>
          </View>
        )}

        {/* Kill switch banner — appears instantly via WebSocket when activated */}
        {checkoutKilled && (
          <View style={styles.killBanner} testID="kill-banner">
            <Text style={styles.killBannerText}>
              🚫 Checkout is temporarily unavailable. We're working on it.
            </Text>
          </View>
        )}

        {/* Feature flag — enable "new_releases" in the admin to reveal */}
        {showNewReleases && (
          <View style={styles.newSection} testID="new-releases">
            <Text style={styles.newSectionLabel}>NEW</Text>
            <Text style={styles.sectionTitle}>New Releases</Text>
            {NEW_RELEASES.map((track) => (
              <TrackRow key={track.id} track={track} />
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recently Played</Text>
          {RECENT_TRACKS.map((track) => (
            <TrackRow key={track.id} track={track} />
          ))}
        </View>

        <View style={styles.configRow} testID="config-api-url">
          <Text style={styles.configLabel}>API</Text>
          <Text style={styles.configValue} numberOfLines={1}>{apiUrl}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: string;
}

function TrackRow({ track }: { track: Track }) {
  return (
    <View style={styles.trackRow} testID={`track-${track.id}`}>
      <View style={styles.trackThumb} />
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle}>{track.title}</Text>
        <Text style={styles.trackArtist}>{track.artist}</Text>
      </View>
      <Text style={styles.trackDuration}>{track.duration}</Text>
    </View>
  );
}

const NEW_RELEASES: Track[] = [
  { id: "n1", title: "Solar Flare", artist: "Drift Engine", duration: "3:55" },
  { id: "n2", title: "Midnight Grid", artist: "SYNTH//", duration: "4:02" },
];

const RECENT_TRACKS: Track[] = [
  { id: "1", title: "Neon Drift", artist: "Axel Nova", duration: "3:42" },
  { id: "2", title: "Blue Static", artist: "LNDN", duration: "2:58" },
  { id: "3", title: "Ultraviolet", artist: "Prism", duration: "4:11" },
  { id: "4", title: "Signal Fade", artist: "Celeste", duration: "3:15" },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  content: {
    padding: 20,
    gap: 24,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 4,
    borderRadius: 16,
    backgroundColor: "#0d0d14",
  },
  headerBold: {
    backgroundColor: "#0f1f3d",
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  logo: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -1,
  },
  logoBold: {
    color: "#60a5fa",
    fontSize: 36,
  },
  tagline: {
    fontSize: 14,
    color: "#6b7280",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  taglineBold: {
    color: "#93c5fd",
    fontSize: 16,
    fontWeight: "700",
  },
  versionBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#7c3aed",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 6,
  },
  versionBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 1,
  },
  variantBadge: {
    fontSize: 10,
    color: "#4b5563",
    marginTop: 4,
  },
  cards: {
    flexDirection: "row",
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 20,
    gap: 4,
  },
  cardAccent: {
    backgroundColor: "#1e1b4b",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#9ca3af",
  },
  configRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
  },
  configLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#3b82f6",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  configValue: {
    flex: 1,
    fontSize: 11,
    color: "#4b5563",
    fontFamily: "monospace",
  },
  onboardingBanner: {
    backgroundColor: "#1a2744",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#3b82f6",
    gap: 4,
  },
  onboardingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#93c5fd",
  },
  onboardingText: {
    fontSize: 13,
    color: "#cbd5e1",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#1f2937",
  },
  trackInfo: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  trackArtist: {
    fontSize: 12,
    color: "#6b7280",
  },
  trackDuration: {
    fontSize: 12,
    color: "#4b5563",
  },
  killBanner: {
    backgroundColor: "#7f1d1d",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  killBannerText: {
    color: "#fca5a5",
    fontSize: 13,
    fontWeight: "500",
  },
  newSection: {
    gap: 12,
    borderRadius: 16,
    backgroundColor: "#0f172a",
    padding: 16,
    borderWidth: 1,
    borderColor: "#1e3a5f",
  },
  newSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#3b82f6",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
