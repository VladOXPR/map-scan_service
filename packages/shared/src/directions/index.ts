export type Platform = "ios" | "android" | "web";

export function buildDirectionsUrl(
  latitude: number | string,
  longitude: number | string,
  platform: Platform
): string {
  const lat = typeof latitude === "number" ? latitude : parseFloat(String(latitude));
  const lng = typeof longitude === "number" ? longitude : parseFloat(String(longitude));
  if (platform === "ios") return `maps://maps.google.com/maps?daddr=${lat},${lng}`;
  if (platform === "android") return `google.navigation:q=${lat},${lng}`;
  return `https://maps.google.com/maps?daddr=${lat},${lng}`;
}

export function detectWebPlatform(userAgent: string): Platform {
  const ua = userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "web";
}

export function buildSupportSmsUrl(phoneNumber: string, stickerId?: string | null): string {
  let smsUrl = `sms:${phoneNumber}`;
  if (stickerId) {
    const messageText = `The number on my battery is ${stickerId}`;
    smsUrl += `?body=${encodeURIComponent(messageText)}`;
  }
  return smsUrl;
}
