import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../theme/tokens';

interface Props {
  label: string;
  active?: boolean;
}

export function Pill({ label, active = false }: Props) {
  return (
    <View style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs - 1,
  },
  pillActive: { backgroundColor: Colors.accent },
  text: { ...Typography.label, color: Colors.textSecondary },
  textActive: { color: Colors.white },
});
