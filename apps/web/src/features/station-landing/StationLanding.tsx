"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ANDROID_PACKAGE,
  APP_SCHEME,
  STATION_PATH_PREFIX,
  WEB_HANDOFF_PARAM,
  buildStationUrl,
  detectStorePlatform,
  playStoreUrl,
  type StorePlatform,
} from "@cuub/core";
import { GradientButton } from "@/components/GradientButton";
import { trackGetApp, useStoreLink } from "@/features/app-links/useStoreLink";
import { webTrack } from "@/lib/analytics";
import type { StationLandingData } from "@/lib/cuubApi";

export interface StationLandingProps {
  code: string;
  /** Null when the station lookup failed; the app link still works. */
  station: StationLandingData | null;
  origin: string;
  webVisitorId: string | null;
}

/**
 * Android: an intent link opens the app on this station if installed and
 * otherwise falls back to Google Play with the `wv` referrer.
 */
function androidIntentUrl(origin: string, code: string, webVisitorId: string | null): string {
  const host = new URL(origin).host;
  const query = webVisitorId ? `?${WEB_HANDOFF_PARAM}=${encodeURIComponent(webVisitorId)}` : "";
  const fallback = encodeURIComponent(playStoreUrl(webVisitorId));
  return (
    `intent://${host}${STATION_PATH_PREFIX}${code}${query}` +
    `#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`
  );
}

/**
 * iOS cannot open a universal link from a page on the same domain, so people
 * who already have the app get the custom scheme (with `wv`) instead.
 */
function schemeUrl(code: string, webVisitorId: string | null): string {
  const query = webVisitorId ? `?${WEB_HANDOFF_PARAM}=${encodeURIComponent(webVisitorId)}` : "";
  return `${APP_SCHEME}:/${STATION_PATH_PREFIX}${code}${query}`;
}

function availability(station: StationLandingData | null): { text: string; tone: "ok" | "muted" | "off" } | null {
  if (!station) return null;
  if (!station.online) return { text: "Offline right now", tone: "off" };
  if (station.charged === 0) return { text: "No power banks available", tone: "muted" };
  return {
    text: station.charged === 1 ? "1 power bank available" : `${station.charged} power banks available`,
    tone: "ok",
  };
}

export function StationLanding({ code, station, origin, webVisitorId }: StationLandingProps) {
  const storeLink = useStoreLink();
  const [platform, setPlatform] = useState<StorePlatform>("other");
  const viewed = useRef(false);

  useEffect(() => {
    const os = detectStorePlatform(navigator.userAgent);
    setPlatform(os);
    if (viewed.current) return;
    viewed.current = true;
    webTrack("station_landing_viewed", { stationCode: code, os });
  }, [code]);

  const status = availability(station);
  const universalLink = buildStationUrl(origin, code, { webVisitorId });
  const openInApp = () => webTrack("open_in_app_tapped", { stationCode: code });

  return (
    <main className="station-landing">
      <div className="station-landing-inner">
        <img className="station-landing-logo" src="/assets/applogo.png" alt="CUUB" width={56} height={56} />

        <section className="station-landing-card">
          <img
            className="station-landing-illu"
            src="/assets/illustrations/Station_on_stand.png"
            alt=""
            width={120}
            height={150}
          />
          <div className="station-landing-copy">
            <h1 className="station-landing-title">{station?.title ?? "CUUB station"}</h1>
            {station?.address ? <p className="station-landing-address">{station.address}</p> : null}
            {status ? (
              <p className={`station-landing-status station-landing-status--${status.tone}`}>
                <span className="station-landing-dot" aria-hidden="true" />
                {status.text}
              </p>
            ) : null}
          </div>
        </section>

        <ol className="station-landing-steps">
          <li>Get the CUUB app</li>
          <li>Sign up and start your membership</li>
          <li>Tap Unlock and take a power bank</li>
        </ol>

        <div className="station-landing-actions">
          {platform === "android" ? (
            <GradientButton
              label="Unlock in the CUUB app"
              href={androidIntentUrl(origin, code, webVisitorId)}
              onClick={openInApp}
            />
          ) : (
            <>
              <GradientButton
                label="Get the CUUB app to unlock"
                href={storeLink.href}
                onClick={() => trackGetApp(storeLink, "station_landing")}
              />
              {platform === "ios" ? (
                <a className="station-landing-secondary" href={schemeUrl(code, webVisitorId)} onClick={openInApp}>
                  Already have the app? Open it
                </a>
              ) : (
                <p className="station-landing-hint">
                  Scan this station&apos;s QR code with your phone&apos;s camera, or open{" "}
                  <a href={universalLink}>{universalLink.replace(/^https:\/\//, "").split("?")[0]}</a> on your phone.
                </p>
              )}
            </>
          )}
          <Link className="station-landing-secondary" href="/">
            See all stations
          </Link>
        </div>

        <p className="station-landing-code">Station {code}</p>
      </div>
    </main>
  );
}
