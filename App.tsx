import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import HomeScreen from "./src/screens/HomeScreen";
import { UpdateBanner } from "./src/components/UpdateBanner";
import { RemoteConfigProvider } from "./src/hooks/useRemoteConfig";
import { OtaProvider } from "./src/contexts/OtaContext";

// ---------------------------------------------------------------------------
// Config server connection
//
// Simulator/Emulator:
//   iOS Simulator    → http://localhost:4000
//   Android Emulator → http://10.0.2.2:4000
//
// Physical device    → replace with your machine's LAN IP, e.g.
//                      http://192.168.1.42:4000
//
// Set OTA_SERVER_URL in app.json extra to override at build time, or
// just edit this constant for local dev.
// ---------------------------------------------------------------------------
const OTA_SERVER_URL: string =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.ota_server_url ?? "http://192.168.1.4:4000";

const CONFIG_API_KEY: string =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.config_api_key ?? "demo-key-123";

export default function App() {
  return (
    <RemoteConfigProvider serverUrl={OTA_SERVER_URL} apiKey={CONFIG_API_KEY}>
      <OtaProvider>
        <HomeScreen />
        <UpdateBanner />
        <StatusBar style="light" />
      </OtaProvider>
    </RemoteConfigProvider>
  );
}
