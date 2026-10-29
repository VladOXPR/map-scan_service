import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { WEB_HANDOFF_PARAM, detectStorePlatform, storeUrlFor } from "@cuub/core";
import { MapView } from "@/features/map-view/MapView";
import { getInitialStations } from "@/lib/getInitialStations";
import { visitorIdFrom } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

/** Apple devices go to the App Store and Android to Google Play (with the `wv` referrer); desktops get the map. */
export default async function AppRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string; wv?: string }>;
}) {
  const [{ embed, wv }, requestHeaders, cookieStore] = await Promise.all([searchParams, headers(), cookies()]);
  const platform = detectStorePlatform(requestHeaders.get("user-agent"));
  if (platform !== "other") {
    const webVisitorId = visitorIdFrom(wv) ?? visitorIdFrom(cookieStore.get(WEB_HANDOFF_PARAM)?.value);
    redirect(storeUrlFor(platform, { webVisitorId }));
  }

  const initialStations = await getInitialStations();
  return (
    <MapView
      variant="full"
      embedMode={embed === "1"}
      initialStations={initialStations}
    />
  );
}
