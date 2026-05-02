import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const phone = process.env.CUUB_SUPPORT_PHONE || "+14642377449";
  return NextResponse.json({ phone });
}
