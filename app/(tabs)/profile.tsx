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
import { Colors, Typography, Spacing, Radius } from "../../src/theme/tokens";

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const { status: otaStatus } = useOta();
  const supportUrl = useDynamicUrl(
    "support_url",
    "https://github.com/VallabhSG/rumik-app",
  );
  const [likedCount, setLikedCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        getLiked(user.id).then((t) => setLikedCount(t.length));
      }
    }, [user]),
  );

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  const version = Constants.expoConfig?.version ?? "—";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
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
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{likedCount}</Text>
            <Text style={styles.statLabel}>Liked</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>APP</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Version" value={`v${version}`} accent />
          <InfoRow
            label="OTA Channel"
            value={otaStatus === "idle" ? "dev" : "production"}
          />
          <InfoRow label="Update Status" value={otaStatus} />
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
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, accent && rowStyles.valueAccent]}>
        {value}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  label: { ...Typography.body, color: Colors.text },
  value: { ...Typography.body, color: Colors.textSecondary },
  valueAccent: { color: Colors.accent, fontWeight: "700" },
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
  email: { ...Typography.caption, color: Colors.textSecondary },
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
  supportBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: "center" as const,
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
