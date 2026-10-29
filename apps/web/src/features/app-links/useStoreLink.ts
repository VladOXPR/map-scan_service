"use client";

import { useEffect, useState } from "react";
import { APP_STORE_URL, detectStorePlatform, playStoreUrl } from "@cuub/core";
import { readWebVisitorId, webTrack } from "@/lib/analytics";

export type StoreLink = {
  /** `/app` until hydration (the server redirect picks the store), then the store itself. */
  href: string;
  store: "app_store" | "play_store";
  platform: "ios" | "android" | "other";
};

const SERVER_LINK: StoreLink = { href: "/app", store: "app_store", platform: "other" };

/** App Store on Apple and desktop, Google Play with the `wv` referrer on Android. */
export function useStoreLink(): StoreLink {
  const [link, setLink] = useState<StoreLink>(SERVER_LINK);
  useEffect(() => {
    const platform = detectStorePlatform(navigator.userAgent);
    setLink(
      platform === "android"
        ? { href: playStoreUrl(readWebVisitorId()), store: "play_store", platform }
        : { href: APP_STORE_URL, store: "app_store", platform },
    );
  }, []);
  return link;
}

export function trackGetApp(link: StoreLink, placement: string): void {
  webTrack("get_app_tapped", { store: link.store, placement });
}
