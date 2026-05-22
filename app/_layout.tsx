import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { tokenCache } from '../src/utils/tokenCache';
import { Slot } from 'expo-router';
import { PlayerProvider } from '../src/services/player';
import { OtaProvider } from '../src/contexts/OtaContext';
import { RemoteConfigProvider } from '../src/hooks/useRemoteConfig';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const otaServerUrl = process.env.EXPO_PUBLIC_OTA_SERVER_URL ?? '';
const otaApiKey = process.env.EXPO_PUBLIC_OTA_API_KEY ?? '';

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <RemoteConfigProvider serverUrl={otaServerUrl} apiKey={otaApiKey}>
          <OtaProvider>
            <PlayerProvider>
              <Slot />
            </PlayerProvider>
          </OtaProvider>
        </RemoteConfigProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
