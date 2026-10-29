import { NextRequest, NextResponse } from "next/server";
import {
  CRAWL_COOKIE,
  CRAWL_COOLDOWN_MS,
  CrawlError,
  checkCrawlPassword,
  clientIp,
  findStationsBySuffix,
  freeDispense,
  isCoolingDown,
  isThreeDigits,
  recordDispense,
} from "@/lib/crawl";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    digits?: unknown;
    password?: unknown;
    stationId?: unknown;
  } | null;
  if (!isThreeDigits(body?.digits) || typeof body?.stationId !== "string") {
    return NextResponse.json({ success: false, error: "Please start over." }, { status: 400 });
  }
  if (!checkCrawlPassword(body.password)) {
    return NextResponse.json({ success: false, error: "That password isn't right." }, { status: 401 });
  }

  const ip = clientIp(req.headers);
  if (isCoolingDown(ip, req.cookies.has(CRAWL_COOKIE))) {
    return NextResponse.json(
      { success: false, error: "You've already grabbed a free power bank. Please try again in an hour." },
      { status: 429 },
    );
  }

  try {
    const matches = await findStationsBySuffix(body.digits);
    if (!matches.some((match) => match.stationId === body.stationId)) {
      return NextResponse.json({ success: false, error: "Please start over." }, { status: 400 });
    }

    await freeDispense(body.stationId);
    recordDispense(ip);
    const res = NextResponse.json({ success: true });
    res.cookies.set(CRAWL_COOKIE, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: CRAWL_COOLDOWN_MS / 1000,
    });
    return res;
  } catch (err) {
    const status = err instanceof CrawlError ? err.status : 500;
    const error = err instanceof CrawlError ? err.message : "Something went wrong. Please try again.";
    if (!(err instanceof CrawlError)) console.error("[crawl] dispense error:", err);
    return NextResponse.json({ success: false, error }, { status });
  }
}
