import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { tokenCache } from '../src/utils/tokenCache';
import { Slot } from 'expo-router';
import { PlayerProvider } from '../src/services/player';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <PlayerProvider>
          <Slot />
        </PlayerProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
