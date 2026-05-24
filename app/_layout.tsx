import { ClerkProvider, ClerkLoaded, useUser } from "@clerk/clerk-expo";
import { tokenCache } from "../src/utils/tokenCache";
import { Slot } from "expo-router";
import { useEffect } from "react";
import { PlayerProvider } from "../src/services/player";
import { OtaProvider } from "../src/contexts/OtaContext";
import {
  RemoteConfigProvider,
  useRemoteConfigClient,
  useFeatureFlag,
} from "../src/hooks/useRemoteConfig";
import { RemoteConfigPayloadProvider } from "../src/contexts/RemoteConfigContext";
import { OnboardingModal } from "../src/components/OnboardingModal";
import Constants from "expo-constants";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const otaApiKey = process.env.EXPO_PUBLIC_OTA_API_KEY ?? "";

// In development, derive the OTA host from Expo's manifest so the correct
// machine IP is used automatically on physical devices and emulators.
function resolveOtaServerUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_OTA_SERVER_URL ?? "";
  if (!__DEV__) return envUrl;
  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.5:8081"
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:4000`;
  }
  return envUrl;
}

const otaServerUrl = resolveOtaServerUrl();

function OnboardingGate() {
  const enabled = useFeatureFlag("new_onboarding");
  return <OnboardingModal enabled={enabled} />;
}

function ClerkUserBridge() {
  const { user } = useUser();
  const client = useRemoteConfigClient();
  const plan = (
    (user?.publicMetadata?.plan as string | undefined) ?? "free"
  ).toLowerCase();

  useEffect(() => {
    if (!user) return;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const email_domain = email.includes("@") ? email.split("@")[1] : undefined;
    client.setUserContext({ userId: user.id, email_domain, plan });
    void client.refresh();
  }, [user?.id, plan]);

  return null;
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <RemoteConfigProvider serverUrl={otaServerUrl} apiKey={otaApiKey}>
          <RemoteConfigPayloadProvider>
            <ClerkUserBridge />
            <OnboardingGate />
            <OtaProvider>
              <PlayerProvider>
                <Slot />
              </PlayerProvider>
            </OtaProvider>
          </RemoteConfigPayloadProvider>
        </RemoteConfigProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
