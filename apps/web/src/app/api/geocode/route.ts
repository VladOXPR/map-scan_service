import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Forward geocode via Mapbox Places API (server-side so the token stays
 * off the browser for this call — map still uses /api/mapbox-token).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { success: false, error: "Missing query parameter q" },
      { status: 400 }
    );
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { success: false, error: "MAPBOX_ACCESS_TOKEN is not set" },
      { status: 503 }
    );
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "us");
  url.searchParams.set("proximity", "-87.65,41.9295"); // bias Chicago
  url.searchParams.set("types", "address,poi,place,locality,neighborhood");

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const json = (await res.json()) as {
      features?: Array<{
        place_name?: string;
        center?: [number, number];
      }>;
      message?: string;
    };

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: json.message || "Geocoding request failed",
        },
        { status: res.status }
      );
    }

    const feature = json.features?.[0];
    const center = feature?.center;
    if (!feature || !center || center.length < 2) {
      return NextResponse.json(
        { success: false, error: "No results for that address" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        placeName: feature.place_name ?? q,
        longitude: center[0],
        latitude: center[1],
      },
    });
  } catch (err) {
    console.error("[geocode]", err);
    return NextResponse.json(
      { success: false, error: "Geocoding failed" },
      { status: 500 }
    );
  }
}
