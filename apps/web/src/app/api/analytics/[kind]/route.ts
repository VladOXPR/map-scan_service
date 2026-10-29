import { NextResponse } from "next/server";

const KINDS = new Set(["device", "session", "events"]);
const MAX_BODY_BYTES = 64 * 1024;

function cuubApiUrl(): string | null {
  const url = process.env["CUUB_API_URL"]?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

/**
 * Same-origin relay to cuub-api's public analytics ingest. It exists so
 * `navigator.sendBeacon` (no CORS preflight, no custom headers) can deliver the
 * last events when a tab is hidden. The body is passed through unchanged.
 */
export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!KINDS.has(kind)) {
    return NextResponse.json({ success: false, error: "Unknown analytics endpoint" }, { status: 404 });
  }
  const baseUrl = cuubApiUrl();
  if (!baseUrl) {
    return NextResponse.json({ success: false, error: "CUUB_API_URL is not configured" }, { status: 503 });
  }

  const body = await request.text();
  if (!body || body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ success: false, error: "Invalid analytics payload" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${baseUrl}/app/analytics/${kind}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": request.headers.get("user-agent") ?? "cuub-web",
      },
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text || null, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ success: false, error: "cuub-api unreachable" }, { status: 502 });
  }
}
