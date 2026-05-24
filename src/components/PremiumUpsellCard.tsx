import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface PremiumUpsellCardProps {
  onUpgrade?: () => void;
}

export function PremiumUpsellCard({ onUpgrade }: PremiumUpsellCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Go Premium</Text>
      <Text style={styles.subtitle}>
        Unlimited skips, offline mode, and more
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={onUpgrade}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>Upgrade Now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: "#7c3aed",
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    marginBottom: 16,
    lineHeight: 20,
  },
  button: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: "flex-start",
  },
  buttonText: {
    color: "#7c3aed",
    fontWeight: "700",
    fontSize: 14,
  },
});
