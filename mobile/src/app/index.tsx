import { Platform } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import LoginScreen from "../components/LoginScreen";

export default function Index() {
  const handleAuthenticated = async (accessToken: string) => {
    if (Platform.OS === "web") {
      sessionStorage.setItem("accessToken", accessToken);
    } else {
      await SecureStore.setItemAsync("accessToken", accessToken);
    }

    router.replace("/explore");
  };

  return <LoginScreen onAuthenticated={handleAuthenticated} />;
}