"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { screenName } from "@cuub/core";
import { isEmbedMode, startWebTracker } from "@/lib/analytics";

function referrerHost(): string | undefined {
  if (!document.referrer) return undefined;
  try {
    const host = new URL(document.referrer).hostname;
    return host === window.location.hostname ? undefined : host;
  } catch {
    return undefined;
  }
}

/** Mounted once in the root layout. Does nothing in `?embed=1` (Framer iframes). */
export function AnalyticsProvider() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (isEmbedMode()) return;
    const tracker = startWebTracker();
    if (!tracker) return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") tracker.background();
      else tracker.foreground();
    };
    const onPageHide = () => tracker.background();
    const onError = (event: ErrorEvent) => tracker.error(event.error ?? event.message, { source: "window" });
    const onRejection = (event: PromiseRejectionEvent) => tracker.error(event.reason, { source: "promise" });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    if (isEmbedMode()) return;
    const tracker = startWebTracker();
    if (!tracker || !pathname) return;
    const path = screenName(pathname);
    if (path === lastPath.current) return;
    tracker.track("page_viewed", {
      path,
      prevPath: lastPath.current ?? undefined,
      referrerHost: lastPath.current ? undefined : referrerHost(),
    });
    lastPath.current = path;
  }, [pathname]);

  return null;
}
