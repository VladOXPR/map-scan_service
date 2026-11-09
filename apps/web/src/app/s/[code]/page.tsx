import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { APP_STORE_URL, WEB_HANDOFF_PARAM, normalizeStationCode, playStoreUrl } from "@cuub/core";
import { StationLanding } from "@/features/station-landing/StationLanding";
import { fetchStationByCode, type StationLandingData } from "@/lib/cuubApi";
import { publicOrigin, visitorIdFrom } from "@/lib/requestContext";
import { trackServerVisit } from "@/lib/serverAnalytics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unlock a CUUB power bank",
  description: "Scan, unlock and charge on the go with the CUUB app.",
};

/** Desktop Safari and iPadOS share a Macintosh user agent, so only these count as phones. */
function phoneOs(userAgent: string | null): "ios" | "android" | null {
  const ua = userAgent ?? "";
  if (/android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return null;
}

/**
 * Station QR target when the app is not installed (installed apps open `/s/<code>` directly).
 * Phones go straight to their app store; other browsers get the station landing page.
 */
export default async function StationLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code: raw }, cookieStore, headerList] = await Promise.all([params, cookies(), headers()]);
  const code = normalizeStationCode(decodeURIComponent(raw));
  if (!code) notFound();
  if (raw !== code) permanentRedirect(`/s/${code}`);

  const webVisitorId = visitorIdFrom(cookieStore.get(WEB_HANDOFF_PARAM)?.value);
  const os = phoneOs(headerList.get("user-agent"));
  if (os) {
    if (webVisitorId) {
      await trackServerVisit({
        visitorId: webVisitorId,
        source: "qr_scan",
        events: [
          { name: "station_landing_viewed", properties: { stationCode: code, os, redirected: true } },
          {
            name: "get_app_tapped",
            properties: { store: os === "ios" ? "app_store" : "play_store", placement: "station_redirect" },
          },
        ],
      });
    }
    redirect(os === "ios" ? APP_STORE_URL : playStoreUrl(webVisitorId));
  }

  let station: StationLandingData | null = null;
  let lookupFailed = false;
  try {
    station = await fetchStationByCode(code);
  } catch (error) {
    console.error(`Station lookup for ${code} failed:`, error);
    lookupFailed = true;
  }
  if (!station && !lookupFailed) notFound();

  return <StationLanding code={code} station={station} origin={publicOrigin()} webVisitorId={webVisitorId} />;
}
