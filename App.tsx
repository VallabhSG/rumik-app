import { StatusBar } from "expo-status-bar";
import HomeScreen from "./src/screens/HomeScreen";
import { UpdateBanner } from "./src/components/UpdateBanner";

export default function App() {
  return (
    <>
      <HomeScreen />
      <UpdateBanner />
      <StatusBar style="light" />
    </>
  );
}
