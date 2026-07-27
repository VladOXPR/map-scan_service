import { MapView } from "@/features/map-view/MapView";
import { getInitialStations } from "@/lib/getInitialStations";

export const dynamic = "force-dynamic";

export default async function BlankPage({
  searchParams,
}: {
  searchParams: { embed?: string };
}) {
  const initialStations = await getInitialStations();
  return (
    <MapView
      variant="blank"
      embedMode={searchParams.embed === "1"}
      initialStations={initialStations}
    />
  );
}
