import { Linking } from "react-native";
import { buildSupportSmsUrl } from "@cuub/shared";
import { SUPPORT_PHONE } from "./config";

export async function openSupportSms(stickerId?: string | null): Promise<void> {
  const url = buildSupportSmsUrl(SUPPORT_PHONE, stickerId ?? null);
  try {
    await Linking.openURL(url);
  } catch (err) {
    console.warn("Failed to open SMS:", err);
  }
}
