import { MapView } from "@/features/map-view/MapView";
import { getInitialStations } from "@/lib/getInitialStations";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string }>;
}) {
  const { embed } = await searchParams;
  const initialStations = await getInitialStations();
  return (
    <MapView
      variant="full"
      embedMode={embed === "1"}
      initialStations={initialStations}
    />
  );
}
