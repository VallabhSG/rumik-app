import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useRouter, useFocusEffect } from "expo-router";
import Constants from "expo-constants";
import { useOta } from "../../src/contexts/OtaContext";
import { getLiked } from "../../src/services/library";
import { useDynamicUrl } from "../../src/hooks/useRemoteConfig";
import { useRemoteConfig } from "../../src/contexts/RemoteConfigContext";
import { Colors, Typography, Spacing, Radius } from "../../src/theme/tokens";
import { getInstallId } from "../../src/services/ota/deviceId";

const PLAN_COLORS: Record<string, string> = {
  pro: "#a78bfa",
  premium: "#f59e0b",
  free: Colors.textMuted,
};

function planColor(plan: string): string {
  return PLAN_COLORS[plan.toLowerCase()] ?? Colors.textMuted;
}

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const { status: otaStatus } = useOta();
  const { config } = useRemoteConfig();
  const supportUrl = useDynamicUrl(
    "support_url",
    "https://github.com/VallabhSG/rumik-app",
  );
  const [likedCount, setLikedCount] = useState(0);
  const [installId, setInstallId] = useState("—");

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        getLiked(user.id).then((t) => setLikedCount(t.length));
      }
      getInstallId().then(setInstallId).catch(() => {});
    }, [user]),
  );

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  const version = Constants.expoConfig?.version ?? "—";
  const plan = (user?.publicMetadata?.plan as string | undefined) ?? "free";
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      })
    : "—";
  const emailVerified = user?.primaryEmailAddress?.verification?.status === "verified";

  // Active flags and experiment assignments from live remote config
  const activeFlags = Object.entries(config.flags)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const experimentEntries = Object.entries(config.experiments);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Avatar ── */}
        <View style={styles.avatar}>
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={styles.avatarImg} />
          ) : (
            <View style={[styles.avatarImg, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {user?.firstName?.[0] ?? "?"}
              </Text>
            </View>
          )}
          <Text style={styles.name}>
            {user?.fullName ?? user?.firstName ?? "Listener"}
          </Text>
          <Text style={styles.email}>
            {user?.primaryEmailAddress?.emailAddress ?? ""}
          </Text>
          <View style={[styles.planBadge, { borderColor: planColor(plan) }]}>
            <Text style={[styles.planText, { color: planColor(plan) }]}>
              {plan.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* ── Stats ── */}
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{likedCount}</Text>
            <Text style={styles.statLabel}>Liked</Text>
          </View>
        </View>

        {/* ── Account ── */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Plan" value={plan} accent />
          <InfoRow label="Member since" value={memberSince} />
          <InfoRow label="Email verified" value={emailVerified ? "Yes" : "No"} />
          <InfoRow label="User ID" value={user?.id ? user.id.slice(0, 18) + "…" : "—"} mono />
        </View>

        {/* ── App ── */}
        <Text style={styles.sectionLabel}>APP</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Version" value={`v${version}`} accent />
          <InfoRow
            label="OTA Channel"
            value={otaStatus === "idle" ? "dev" : "production"}
          />
          <InfoRow label="Update Status" value={otaStatus} />
          <InfoRow label="Install ID" value={installId.slice(0, 18) + "…"} mono />
        </View>

        {/* ── Live Remote Config ── */}
        <Text style={styles.sectionLabel}>REMOTE CONFIG</Text>
        <View style={styles.infoCard}>
          {activeFlags.length === 0 ? (
            <Text style={styles.emptyNote}>No flags enabled for your device</Text>
          ) : (
            activeFlags.map((key) => (
              <View key={key} style={styles.flagRow}>
                <View style={styles.flagDot} />
                <Text style={styles.flagKey}>{key}</Text>
                <Text style={styles.flagOn}>ON</Text>
              </View>
            ))
          )}

          {experimentEntries.length > 0 && (
            <View style={styles.divider} />
          )}

          {experimentEntries.map(([key, assignment]) => (
            <View key={key} style={styles.flagRow}>
              <View style={[styles.flagDot, styles.expDot]} />
              <Text style={styles.flagKey}>{key}</Text>
              <Text style={styles.variantChip}>{assignment.variant_id}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.supportBtn}
          onPress={() => Linking.openURL(supportUrl)}
        >
          <Text style={styles.supportText}>Help & Support</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text
        style={[
          rowStyles.value,
          accent && rowStyles.valueAccent,
          mono && rowStyles.valueMono,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  label: { ...Typography.body, color: Colors.text },
  value: { ...Typography.body, color: Colors.textSecondary, maxWidth: "55%" },
  valueAccent: { color: Colors.accent, fontWeight: "700" },
  valueMono: { fontFamily: "monospace", fontSize: 11 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },

  avatar: {
    alignItems: "center",
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  avatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: Spacing.md,
  },
  avatarFallback: {
    backgroundColor: Colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 28, fontWeight: "700", color: Colors.text },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 3,
  },
  email: { ...Typography.caption, color: Colors.textSecondary, marginBottom: Spacing.sm },
  planBadge: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 4,
  },
  planText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  stats: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  stat: { alignItems: "center", paddingHorizontal: Spacing.xl },
  statNum: { fontSize: 22, fontWeight: "800", color: Colors.accent },
  statLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  sectionLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },

  emptyNote: {
    ...Typography.caption,
    color: Colors.textMuted,
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  flagDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#3ecf8e",
  },
  expDot: {
    backgroundColor: "#a78bfa",
  },
  flagKey: {
    flex: 1,
    ...Typography.body,
    color: Colors.text,
    fontSize: 13,
  },
  flagOn: {
    fontSize: 10,
    fontWeight: "800",
    color: "#3ecf8e",
    letterSpacing: 1,
  },
  variantChip: {
    fontSize: 11,
    fontWeight: "600",
    color: "#a78bfa",
    backgroundColor: "#a78bfa18",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },

  supportBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: "center",
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  supportText: { ...Typography.body, color: Colors.accent },
  signOutBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  signOutText: { ...Typography.body, color: Colors.textSecondary },
});
