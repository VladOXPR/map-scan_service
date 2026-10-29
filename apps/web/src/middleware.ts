import { NextResponse, type NextRequest } from "next/server";
import { WEB_HANDOFF_PARAM } from "@cuub/core";
import { EMBED_HEADER, PAGE_URL_HEADER } from "@/lib/requestContext";

const VISITOR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TWO_YEARS_SECONDS = 60 * 60 * 24 * 365 * 2;

/**
 * First-party `wv` visitor id. Server-rendered pages read it to put the
 * handoff parameter on store and app links; the client tracker uses it as the
 * web deviceId. Readable by script on purpose (not HttpOnly).
 *
 * Also hands the page URL and embed flag to server components, which cannot
 * read search params from the root layout (Smart App Banner).
 */
export function middleware(request: NextRequest) {
  const existing = request.cookies.get(WEB_HANDOFF_PARAM)?.value;
  const visitorId = existing && VISITOR_RE.test(existing) ? existing : null;

  const headers = new Headers(request.headers);
  headers.set(PAGE_URL_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (request.nextUrl.searchParams.get("embed") === "1") headers.set(EMBED_HEADER, "1");
  else headers.delete(EMBED_HEADER);

  if (visitorId) return NextResponse.next({ request: { headers } });

  const created = crypto.randomUUID();
  request.cookies.set(WEB_HANDOFF_PARAM, created);
  headers.set("cookie", request.cookies.toString());
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(WEB_HANDOFF_PARAM, created, {
    path: "/",
    maxAge: TWO_YEARS_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|\\.well-known/|favicon|icon|apple-icon|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|map|txt|json)$).*)"],
};
