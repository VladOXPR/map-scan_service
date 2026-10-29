import { NextRequest, NextResponse } from "next/server";
import { WEB_HANDOFF_PARAM } from "@cuub/core";
import { proxyCuubBattery } from "@/lib/cuubApi";
import { visitorIdFrom } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ sticker_id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { sticker_id } = await params;
    const { status, payload } = await proxyCuubBattery({
      path: `/battery/${encodeURIComponent(sticker_id)}`,
      method: "GET",
    });
    return NextResponse.json(payload, { status });
  } catch (err) {
    console.error("Error fetching battery data:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch battery data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { sticker_id } = await params;
    const manufactureId = req.headers.get("manufacture_id") || "";
    const stickerType = req.headers.get("sticker_type") || "type one";
    const wv = visitorIdFrom(req.cookies.get(WEB_HANDOFF_PARAM)?.value);

    const { status, payload } = await proxyCuubBattery({
      path: `/battery/${encodeURIComponent(sticker_id)}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        manufacture_id: manufactureId,
        sticker_type: stickerType,
      },
      body: JSON.stringify(wv ? { wv } : {}),
    });
    return NextResponse.json(payload, { status });
  } catch (err) {
    console.error("Error creating scan record:", err);
    return NextResponse.json(
      { success: false, error: "Failed to create scan record" },
      { status: 500 }
    );
  }
}

// sizl advert flow deprecated — noop stub for legacy clients.
export async function PATCH(_req: NextRequest, _ctx: RouteContext) {
  return NextResponse.json({ success: true });
}
