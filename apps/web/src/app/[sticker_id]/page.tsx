import { notFound } from "next/navigation";
import { MapView } from "@/features/map-view/MapView";
import { ScanModal } from "@/features/scan/ScanModal";
import { getInitialStations } from "@/lib/getInitialStations";

const RESERVED = new Set(["map", "blank", "api", "_next", "favicon.ico"]);

export const dynamic = "force-dynamic";

export default async function StickerPage({
  params,
  searchParams,
}: {
  params: { sticker_id: string };
  searchParams: { embed?: string };
}) {
  const stickerId = params.sticker_id;
  if (!stickerId || RESERVED.has(stickerId) || stickerId.includes(".")) {
    notFound();
  }
  const initialStations = await getInitialStations();
  return (
    <>
      <MapView
        variant="full"
        stickerId={stickerId}
        embedMode={searchParams.embed === "1"}
        initialStations={initialStations}
      />
      <ScanModal stickerId={stickerId} />
    </>
  );
}
