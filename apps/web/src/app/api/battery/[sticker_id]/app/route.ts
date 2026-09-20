import { NextRequest, NextResponse } from "next/server";
import { proxyCuubBattery } from "@/lib/cuubApi";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { sticker_id: string };
}

/** Marks the latest scan visit as an App Store / Get App tap. */
export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const { status, payload } = await proxyCuubBattery({
      path: `/battery/${encodeURIComponent(params.sticker_id)}/app`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: true }),
    });
    return NextResponse.json(payload, { status });
  } catch (err) {
    console.error("Error recording app tap:", err);
    return NextResponse.json(
      { success: false, error: "Failed to record app tap" },
      { status: 500 }
    );
  }
}
