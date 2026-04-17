import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';

interface Props {
  onNavigate?: (screen: string) => void;
}

export default function HomeScreen({ onNavigate }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.logo}>rumik</Text>
          <Text style={styles.tagline}>feel the music</Text>
        </View>

        <View style={styles.cards}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => onNavigate?.('discover')}
            testID="discover-card"
          >
            <Text style={styles.cardTitle}>Discover</Text>
            <Text style={styles.cardSubtitle}>Find new sounds</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, styles.cardAccent]}
            onPress={() => onNavigate?.('library')}
            testID="library-card"
          >
            <Text style={styles.cardTitle}>Library</Text>
            <Text style={styles.cardSubtitle}>Your collection</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recently Played</Text>
          {RECENT_TRACKS.map((track) => (
            <TrackRow key={track.id} track={track} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: string;
}

function TrackRow({ track }: { track: Track }) {
  return (
    <View style={styles.trackRow} testID={`track-${track.id}`}>
      <View style={styles.trackThumb} />
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle}>{track.title}</Text>
        <Text style={styles.trackArtist}>{track.artist}</Text>
      </View>
      <Text style={styles.trackDuration}>{track.duration}</Text>
    </View>
  );
}

const RECENT_TRACKS: Track[] = [
  { id: '1', title: 'Neon Drift', artist: 'Axel Nova', duration: '3:42' },
  { id: '2', title: 'Blue Static', artist: 'LNDN', duration: '2:58' },
  { id: '3', title: 'Ultraviolet', artist: 'Prism', duration: '4:11' },
  { id: '4', title: 'Signal Fade', artist: 'Celeste', duration: '3:15' },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  content: {
    padding: 20,
    gap: 24,
  },
  header: {
    paddingTop: 12,
    gap: 4,
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 14,
    color: '#6b7280',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cards: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    gap: 4,
  },
  cardAccent: {
    backgroundColor: '#1e1b4b',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  trackInfo: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  trackArtist: {
    fontSize: 12,
    color: '#6b7280',
  },
  trackDuration: {
    fontSize: 12,
    color: '#4b5563',
  },
});
