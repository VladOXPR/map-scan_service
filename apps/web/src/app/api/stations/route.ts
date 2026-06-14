import { NextResponse } from "next/server";
import {
  STATIONS_REVALIDATE_SECONDS,
  getCachedStationsResult,
} from "@/lib/getInitialStations";

// `force-dynamic` is gone: we WANT this cached. The upstream proxy call is
// memoized by unstable_cache, so the actual round-trip to api.cuub.tech only
// happens once per revalidate window per server instance.
export async function GET() {
  try {
    const { status, payload } = await getCachedStationsResult();
    return NextResponse.json(payload, {
      status,
      headers: {
        // Browser: 60s. CDN/edge: full revalidate window. SWR keeps responses
        // snappy at the moment of expiry.
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
