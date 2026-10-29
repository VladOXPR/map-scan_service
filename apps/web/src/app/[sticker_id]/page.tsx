import { notFound } from "next/navigation";
import { MapView } from "@/features/map-view/MapView";
import { getInitialStations } from "@/lib/getInitialStations";

const RESERVED = new Set([
  "map",
  "blank",
  "api",
  "_next",
  "favicon.ico",
  "app",
  "sales",
  "s",
]);

export const dynamic = "force-dynamic";

export default async function StickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ sticker_id: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const [{ sticker_id: stickerId }, { embed }] = await Promise.all([params, searchParams]);
  if (!stickerId || RESERVED.has(stickerId) || stickerId.includes(".")) {
    notFound();
  }
  const initialStations = await getInitialStations();
  return (
    <MapView
      variant="full"
      stickerId={stickerId}
      embedMode={embed === "1"}
      initialStations={initialStations}
    />
  );
}
