import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MapView } from "@/features/map-view/MapView";
import { getInitialStations } from "@/lib/getInitialStations";

export const dynamic = "force-dynamic";

const APP_STORE_URL = "https://apps.apple.com/us/app/cuub/id6805257335";

function isAppleDevice(userAgent: string): boolean {
  return /iPad|iPhone|iPod|Macintosh/.test(userAgent);
}

export default async function AppRedirectPage({
  searchParams,
}: {
  searchParams: { embed?: string };
}) {
  const ua = headers().get("user-agent") ?? "";
  if (isAppleDevice(ua)) {
    redirect(APP_STORE_URL);
  }

  const initialStations = await getInitialStations();
  return (
    <MapView
      variant="full"
      embedMode={searchParams.embed === "1"}
      initialStations={initialStations}
    />
  );
}
