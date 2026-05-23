import React from "react";
import { Text, StyleSheet } from "react-native";
import { Colors, Typography, Spacing } from "../../theme/tokens";

interface Props {
  children: string;
}

export function SectionLabel({ children }: Props) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: {
    ...Typography.label,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
});
