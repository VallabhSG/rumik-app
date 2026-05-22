import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useOta } from '../contexts/OtaContext';
import { Colors, Typography, Spacing, Radius } from '../theme/tokens';

export function UpdateBanner() {
  const { status, download, applyNow } = useOta();
  if (status !== 'available' && status !== 'ready' && status !== 'downloading') return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {status === 'downloading'
          ? 'Downloading update…'
          : status === 'ready'
          ? 'Update ready'
          : 'Update available'}
      </Text>
      {status === 'available' && (
        <TouchableOpacity style={styles.btn} onPress={download}>
          <Text style={styles.btnText}>Download</Text>
        </TouchableOpacity>
      )}
      {status === 'ready' && (
        <TouchableOpacity style={styles.btn} onPress={applyNow}>
          <Text style={styles.btnText}>Restart</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  text: { ...Typography.caption, color: Colors.text, flex: 1 },
  btn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  btnText: { ...Typography.label, color: Colors.white },
});
