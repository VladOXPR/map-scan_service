import { SalesMapView } from "@/features/sales/SalesMapView";
import { getInitialStations } from "@/lib/getInitialStations";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const initialStations = await getInitialStations();
  return <SalesMapView initialStations={initialStations} />;
}
