import { NextResponse } from "next/server";
import { proxyCuub } from "@/lib/cuubApi";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { status, payload } = await proxyCuub({
      path: "/stations",
      method: "GET",
    });
    return NextResponse.json(payload, { status });
  } catch (err) {
    console.error("Error fetching stations:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch stations" },
      { status: 500 }
    );
  }
}
