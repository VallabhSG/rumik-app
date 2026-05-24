import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Spacing, Radius, Typography } from "../theme/tokens";

const STORAGE_KEY = "onboarding:shown_v2";
const { width } = Dimensions.get("window");

const STEPS = [
  {
    emoji: "🎵",
    title: "Discover Music",
    body: "Browse charts, search by genre, and find your next favourite track.",
  },
  {
    emoji: "⬇",
    title: "Listen Offline",
    body: "Download any track and play it without an internet connection.",
  },
  {
    emoji: "✨",
    title: "Made for You",
    body: "Feature flags and experiments tailor the experience to your plan and device.",
  },
];

interface Props {
  enabled: boolean;
}

export function OnboardingModal({ enabled }: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!enabled) return;
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (!val) setVisible(true);
    });
  }, [enabled]);

  const dismiss = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const goTo = (index: number) => {
    setStep(index);
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setStep(index);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScroll}
            scrollEventThrottle={16}
          >
            {STEPS.map((s, i) => (
              <View key={i} style={styles.slide}>
                <Text style={styles.emoji}>{s.emoji}</Text>
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.body}>{s.body}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === step && styles.dotActive]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            {step < STEPS.length - 1 ? (
              <>
                <TouchableOpacity onPress={dismiss}>
                  <Text style={styles.skip}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nextBtn}
                  onPress={() => goTo(step + 1)}
                >
                  <Text style={styles.nextText}>Next</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.nextBtn} onPress={dismiss}>
                <Text style={styles.nextText}>Get Started</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: width - Spacing.xl * 2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: "hidden",
    paddingBottom: Spacing.lg,
  },
  slide: {
    width: width - Spacing.xl * 2,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  emoji: { fontSize: 56, marginBottom: Spacing.md },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  body: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: Spacing.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.muted,
  },
  dotActive: { backgroundColor: Colors.accent, width: 18 },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  skip: { ...Typography.body, color: Colors.textMuted },
  nextBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  nextText: { color: Colors.white, fontWeight: "700", fontSize: 15 },
});
