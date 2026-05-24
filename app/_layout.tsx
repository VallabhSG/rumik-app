import { ClerkProvider, ClerkLoaded, useUser } from "@clerk/clerk-expo";
import { tokenCache } from "../src/utils/tokenCache";
import { Slot } from "expo-router";
import { useEffect } from "react";
import { PlayerProvider } from "../src/services/player";
import { OtaProvider } from "../src/contexts/OtaContext";
import { RemoteConfigProvider, useRemoteConfigClient } from "../src/hooks/useRemoteConfig";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const otaServerUrl = process.env.EXPO_PUBLIC_OTA_SERVER_URL ?? "";
const otaApiKey = process.env.EXPO_PUBLIC_OTA_API_KEY ?? "";

function ClerkUserBridge() {
  const { user } = useUser();
  const client = useRemoteConfigClient();

  useEffect(() => {
    if (!user) return;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const email_domain = email.includes("@") ? email.split("@")[1] : undefined;
    const plan = (user.publicMetadata?.plan as string | undefined) ?? "free";
    client.setUserContext({ userId: user.id, email_domain, plan });
  }, [user?.id]);

  return null;
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <RemoteConfigProvider serverUrl={otaServerUrl} apiKey={otaApiKey}>
          <ClerkUserBridge />
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
