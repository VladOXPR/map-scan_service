import { NextRequest, NextResponse } from "next/server";
import { CrawlError, checkCrawlPassword, findStationsBySuffix, isThreeDigits } from "@/lib/crawl";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { digits?: unknown; password?: unknown } | null;
  if (!isThreeDigits(body?.digits)) {
    return NextResponse.json({ success: false, error: "Enter the last 3 digits of the station ID." }, { status: 400 });
  }
  if (!checkCrawlPassword(body?.password)) {
    return NextResponse.json({ success: false, error: "That password isn't right." }, { status: 401 });
  }

  try {
    const matches = await findStationsBySuffix(body.digits);
    return NextResponse.json({ success: true, matches });
  } catch (err) {
    const status = err instanceof CrawlError ? err.status : 500;
    const error = err instanceof CrawlError ? err.message : "Something went wrong. Please try again.";
    if (!(err instanceof CrawlError)) console.error("[crawl] lookup error:", err);
    return NextResponse.json({ success: false, error }, { status });
  }
}
