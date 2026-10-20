import type { Station } from "@cuub/shared";
import { buildDirectionsUrl, detectWebPlatform } from "@cuub/shared";

/** Opens the platform's maps app (maps:// on iOS, google.navigation: on Android). */
export function openDirections(station: Station) {
  const platform = detectWebPlatform(navigator.userAgent || "");
  const url = buildDirectionsUrl(station.latitude, station.longitude, platform);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {
      /* noop */
    }
  }, 0);
}
