import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "MAPBOX_ACCESS_TOKEN is not set" },
      { status: 503 }
    );
  }
  return NextResponse.json({ token });
}
