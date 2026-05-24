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
import {
  useFeatureFlag,
  useKillSwitch,
  useExperiment,
  useDynamicUrl,
} from "../hooks/useRemoteConfig";
import { useOta } from "../contexts/OtaContext";
import { useFlag, useExperimentVariant } from "../contexts/RemoteConfigContext";
import { PremiumUpsellCard } from "../components/PremiumUpsellCard";

interface Props {
  onNavigate?: (screen: string) => void;
}

// Vary thumbnail backgrounds across the tonal staircase so rows are distinct
const THUMB_PALETTE = ["#1a1a2e", "#1e1b4b", "#0f1724", "#191320"];
function thumbBg(id: string): string {
  return THUMB_PALETTE[id.charCodeAt(0) % THUMB_PALETTE.length];
}

export default function HomeScreen({ onNavigate }: Props) {
  // ── Remote config ─────────────────────────────────────────────────────────
  const { status: otaStatus } = useOta();
  const showNewReleases = useFeatureFlag("new_releases", false);
  const showNewOnboarding = useFeatureFlag("new_onboarding", false);
  const taglineVariant = useExperiment("tagline_test", "control");
  const apiUrl = useDynamicUrl("api_base_url", "https://api.rumik.app/v1");
  const checkoutKilled = useKillSwitch("checkout");
  const showPremiumUpsell = useFlag("show_premium_upsell");
  const homeLayoutVariant = useExperimentVariant("home_layout");
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.versionBadge}>
            <Text style={styles.versionBadgeText}>
              v{Constants.expoConfig?.version ?? "—"}
              {otaStatus === "available" || otaStatus === "ready" ? " ✦" : ""}
            </Text>
          </View>

          {/* Amber accent: first use of the warm token */}
          <View style={styles.logoAccent} />

          <Text
            style={[styles.logo, taglineVariant === "bold" && styles.logoBold]}
          >
            rumik
          </Text>
          <Text
            style={[
              styles.tagline,
              taglineVariant === "bold" && styles.taglineBold,
            ]}
          >
            {taglineVariant === "bold"
              ? "your sound. your world."
              : "feel the music"}
          </Text>

          {/* Variant marker: nearly invisible, for test instrumentation only */}
          <Text style={styles.variantMarker}>
            {taglineVariant === "bold" ? "b" : "a"}
          </Text>
        </View>

        {/* ── home_layout experiment: control = cards→upsell→recent, grid = recent→cards→upsell, horizontal = upsell→recent→cards ── */}
        {homeLayoutVariant === "horizontal" && showPremiumUpsell && (
          <PremiumUpsellCard onUpgrade={() => { /* TODO: navigate to upgrade */ }} />
        )}

        {homeLayoutVariant === "grid" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently Played</Text>
            {RECENT_TRACKS.map((track) => (
              <TrackRow key={track.id} track={track} />
            ))}
          </View>
        )}

        {/* ── Navigation cards ────────────────────────────────────────────── */}
        <View style={styles.cards}>
          <TouchableOpacity
            style={styles.cardPrimary}
            onPress={() => onNavigate?.("discover")}
            testID="discover-card"
            activeOpacity={0.85}
          >
            <Text style={styles.cardDecor}>01</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>Discover</Text>
              <Text style={styles.cardSubtitle}>Find new sounds</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cardSecondary}
            onPress={() => onNavigate?.("library")}
            testID="library-card"
            activeOpacity={0.85}
          >
            <Text style={styles.cardDecor}>02</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>Library</Text>
              <Text style={styles.cardSubtitle}>Your collection</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Feature flag: premium upsell (control + grid variants) ──────── */}
        {homeLayoutVariant !== "horizontal" && showPremiumUpsell && (
          <PremiumUpsellCard onUpgrade={() => { /* TODO: navigate to upgrade */ }} />
        )}

        {/* ── Feature flag: new onboarding ────────────────────────────────── */}
        {showNewOnboarding && (
          <View style={styles.onboardingBanner} testID="new-onboarding">
            <Text style={styles.onboardingTitle}>New Experience</Text>
            <Text style={styles.onboardingText}>
              We&apos;ve redesigned your onboarding. Tap to explore the new
              flow.
            </Text>
          </View>
        )}

        {/* ── Kill switch banner ───────────────────────────────────────────── */}
        {checkoutKilled && (
          <View style={styles.killBanner} testID="kill-banner">
            <Text style={styles.killBannerText}>
              Checkout is temporarily unavailable. We&apos;re working on it.
            </Text>
          </View>
        )}

        {/* ── Feature flag: new releases ───────────────────────────────────── */}
        {showNewReleases && (
          <View style={styles.newSection} testID="new-releases">
            <Text style={styles.newSectionLabel}>New</Text>
            <Text style={styles.sectionTitle}>New Releases</Text>
            {NEW_RELEASES.map((track) => (
              <TrackRow key={track.id} track={track} />
            ))}
          </View>
        )}

        {/* ── Recently played (control + horizontal variants) ──────────────── */}
        {homeLayoutVariant !== "grid" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently Played</Text>
            {RECENT_TRACKS.map((track) => (
              <TrackRow key={track.id} track={track} />
            ))}
          </View>
        )}

        {/* ── API config row ───────────────────────────────────────────────── */}
        <View style={styles.configRow} testID="config-api-url">
          <Text style={styles.configLabel}>API</Text>
          <Text style={styles.configValue} numberOfLines={1}>
            {apiUrl}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: string;
}

function TrackRow({ track }: { track: Track }) {
  return (
    <View style={styles.trackRow} testID={`track-${track.id}`}>
      <View
        style={[styles.trackThumb, { backgroundColor: thumbBg(track.id) }]}
      />
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle}>{track.title}</Text>
        <Text style={styles.trackArtist}>{track.artist}</Text>
      </View>
      <Text style={styles.trackDuration}>{track.duration}</Text>
    </View>
  );
}

// ── Data ────────────────────────────────────────────────────────────────────

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

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 32,
  },

  // Header
  header: {
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  versionBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#7c3aed",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 20,
  },
  versionBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 1,
  },
  logoAccent: {
    width: 28,
    height: 3,
    backgroundColor: "#c07828",
    borderRadius: 2,
    marginBottom: 12,
  },
  logo: {
    fontSize: 52,
    fontWeight: "800",
    color: "#f0f0f8",
    letterSpacing: -2,
    lineHeight: 54,
  },
  logoBold: {
    color: "#60a5fa",
    fontSize: 58,
    letterSpacing: -2.5,
  },
  tagline: {
    fontSize: 11,
    color: "#4b5563",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginTop: 8,
  },
  taglineBold: {
    color: "#6b7280",
    fontWeight: "500",
    letterSpacing: 2,
  },
  variantMarker: {
    fontSize: 9,
    color: "#18181e",
    marginTop: 6,
  },

  // Navigation cards: asymmetric 1.65 / 1 split, breaks the identical grid
  cards: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  cardPrimary: {
    flex: 1.65,
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 20,
    paddingBottom: 28,
    overflow: "hidden",
  },
  cardSecondary: {
    flex: 1,
    backgroundColor: "#1e1b4b",
    borderRadius: 16,
    padding: 20,
    paddingBottom: 28,
    overflow: "hidden",
  },
  cardDecor: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff0a",
    letterSpacing: -1,
    lineHeight: 32,
    marginBottom: 12,
  },
  cardBody: {
    gap: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f0f0f8",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#6b7280",
  },

  // Section headers recede so track titles carry the hierarchy
  section: {
    gap: 0,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4b5563",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 12,
  },

  // Track rows: containerless, vertical rhythm only
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  trackInfo: {
    flex: 1,
    gap: 3,
  },
  trackTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f0f0f8",
  },
  trackArtist: {
    fontSize: 12,
    fontWeight: "400",
    color: "#4b5563",
  },
  trackDuration: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },

  // New releases: editorial surface
  newSection: {
    gap: 0,
    borderRadius: 16,
    backgroundColor: "#0d0d14",
    padding: 20,
    paddingTop: 16,
  },
  newSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#c07828",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 4,
  },

  // Status banners: full-perimeter borders, never side-stripe
  onboardingBanner: {
    backgroundColor: "#1a2744",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#3b82f6",
    gap: 4,
  },
  onboardingTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#93c5fd",
  },
  onboardingText: {
    fontSize: 13,
    color: "#cbd5e1",
    lineHeight: 19,
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
    lineHeight: 19,
  },

  // Config row: technical metadata, fully receded
  configRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#141420",
  },
  configLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#374151",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  configValue: {
    flex: 1,
    fontSize: 11,
    color: "#374151",
    fontFamily: "monospace",
  },
});
