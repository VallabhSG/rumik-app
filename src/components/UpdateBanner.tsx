import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useOtaUpdate } from "../hooks/useOtaUpdate";

/**
 * Minimal non-intrusive banner that surfaces OTA update state.
 * Renders nothing when idle, up-to-date, or not in a rollout cohort.
 *
 * Replace this with your own design — the hook is the important part.
 */
export function UpdateBanner() {
  const { status, download, applyNow } = useOtaUpdate();

  if (status === "available") {
    return (
      <View style={styles.banner}>
        <Text style={styles.label}>Update available</Text>
        <TouchableOpacity style={styles.btn} onPress={download}>
          <Text style={styles.btnText}>Download</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === "downloading") {
    return (
      <View style={styles.banner}>
        <ActivityIndicator size="small" color="#a5b4fc" />
        <Text style={styles.label}>Downloading update…</Text>
      </View>
    );
  }

  if (status === "ready") {
    return (
      <View style={styles.banner}>
        <Text style={styles.label}>Update ready</Text>
        <TouchableOpacity style={styles.btn} onPress={applyNow}>
          <Text style={styles.btnText}>Restart</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    bottom: 32,
    left: 16,
    right: 16,
    backgroundColor: "#1e1b4b",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  label: {
    color: "#e0e7ff",
    fontSize: 14,
    flex: 1,
  },
  btn: {
    backgroundColor: "#6366f1",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  btnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
});
