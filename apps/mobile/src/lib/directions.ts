import { Linking, Platform } from "react-native";
import { buildDirectionsUrl, type Platform as CuubPlatform } from "@cuub/shared";

export async function openDirectionsTo(
  latitude: number | string,
  longitude: number | string
): Promise<void> {
  const platform: CuubPlatform =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
  const url = buildDirectionsUrl(latitude, longitude, platform);
  try {
    await Linking.openURL(url);
  } catch (err) {
    console.warn("Failed to open directions:", err);
  }
}
