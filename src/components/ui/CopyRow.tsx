import React, { useState } from "react";
import { TouchableOpacity, Text, StyleSheet, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Colors, Typography, Spacing } from "../../theme/tokens";

interface CopyRowProps {
  label: string;
  value: string;
}

export function CopyRow({ label, value }: CopyRowProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    Alert.alert("Copied", value);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TouchableOpacity style={styles.row} onPress={copy} activeOpacity={0.6}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, styles.valueMono]} numberOfLines={1}>
        {value ? value.slice(0, 16) + "…" : "—"}{" "}
        <Text style={{ color: copied ? "#3ecf8e" : Colors.textMuted, fontSize: 10 }}>
          {copied ? "✓ copied" : "tap to copy"}
        </Text>
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  label: { ...Typography.body, color: Colors.text },
  value: { ...Typography.body, color: Colors.textSecondary, maxWidth: "55%" },
  valueMono: { fontFamily: "monospace", fontSize: 11 },
});
