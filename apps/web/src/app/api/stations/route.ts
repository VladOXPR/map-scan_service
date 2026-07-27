import { NextResponse } from "next/server";
import { STATIONS_REVALIDATE_SECONDS, getStationsResult } from "@/lib/getInitialStations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { status, payload } = await getStationsResult();
    return NextResponse.json(payload, {
      status,
      headers: {
        "Cache-Control": `public, max-age=60, s-maxage=${STATIONS_REVALIDATE_SECONDS}, stale-while-revalidate=600`,
      },
    });
  } catch (err) {
    console.error("Error fetching stations:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch stations" },
      { status: 500 }
    );
  }
}
