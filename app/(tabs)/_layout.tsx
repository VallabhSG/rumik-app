import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '../../src/components/player/MiniPlayer';
import { NowPlaying } from '../../src/components/player/NowPlaying';
import { Colors } from '../../src/theme/tokens';
import { configClientRef } from '../../src/utils/configClientRef';

const TAB_BAR_HEIGHT = 49;

export default function TabsLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const [nowPlayingVisible, setNowPlayingVisible] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/(auth)/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (user?.id && configClientRef.current) {
      configClientRef.current.setInstallId(user.id);
    }
  }, [user?.id]);

  if (!isLoaded || !isSignedIn) return null;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon label="🏠" color={color} /> }}
        />
        <Tabs.Screen
          name="discover"
          options={{ title: 'Discover', tabBarIcon: ({ color }) => <TabIcon label="🔍" color={color} /> }}
        />
        <Tabs.Screen
          name="library"
          options={{ title: 'Library', tabBarIcon: ({ color }) => <TabIcon label="📚" color={color} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon label="👤" color={color} /> }}
        />
      </Tabs>

      {/* Absolutely positioned above the tab bar */}
      <View style={[styles.miniPlayerWrapper, { bottom: TAB_BAR_HEIGHT + bottom }]}>
        <MiniPlayer onExpand={() => setNowPlayingVisible(true)} />
      </View>

      <NowPlaying visible={nowPlayingVisible} onClose={() => setNowPlayingVisible(false)} />
    </View>
  );
}

function TabIcon({ label, color }: { label: string; color: string }) {
  return (
    <Text style={{ fontSize: 18, opacity: color === Colors.accent ? 1 : 0.5 }}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  tabBar: {
    backgroundColor: Colors.bg,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    elevation: 0,
  },
  miniPlayerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
