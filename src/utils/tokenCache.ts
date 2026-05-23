import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const createTokenCache = () => ({
  getToken: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(null)
      : SecureStore.getItemAsync(key),
  saveToken: (key: string, token: string) =>
    Platform.OS === "web"
      ? Promise.resolve()
      : SecureStore.setItemAsync(key, token),
  clearToken: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve()
      : SecureStore.deleteItemAsync(key),
});

export const tokenCache = createTokenCache();
