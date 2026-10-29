import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { WEB_HANDOFF_PARAM, normalizeStationCode } from "@cuub/core";
import { StationLanding } from "@/features/station-landing/StationLanding";
import { fetchStationByCode, type StationLandingData } from "@/lib/cuubApi";
import { publicOrigin, visitorIdFrom } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unlock a CUUB power bank",
  description: "Scan, unlock and charge on the go with the CUUB app.",
};

/** Station QR target when the app is not installed (installed apps open `/s/<code>` directly). */
export default async function StationLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code: raw }, cookieStore] = await Promise.all([params, cookies()]);
  const code = normalizeStationCode(decodeURIComponent(raw));
  if (!code) notFound();
  if (raw !== code) permanentRedirect(`/s/${code}`);

  let station: StationLandingData | null = null;
  let lookupFailed = false;
  try {
    station = await fetchStationByCode(code);
  } catch (error) {
    console.error(`Station lookup for ${code} failed:`, error);
    lookupFailed = true;
  }
  if (!station && !lookupFailed) notFound();

  return (
    <StationLanding
      code={code}
      station={station}
      origin={publicOrigin()}
      webVisitorId={visitorIdFrom(cookieStore.get(WEB_HANDOFF_PARAM)?.value)}
    />
  );
}
