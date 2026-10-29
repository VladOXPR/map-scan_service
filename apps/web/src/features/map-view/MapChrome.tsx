"use client";

import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { DistancePill } from "@/components/DistancePill";
import { GradientButton } from "@/components/GradientButton";
import { trackGetApp, useStoreLink } from "@/features/app-links/useStoreLink";

export function SupportButton({ onClick, style }: { onClick: () => void; style?: CSSProperties }) {
  return (
    <button type="button" className="cuub-support-btn" onClick={onClick} style={style}>
      Support
    </button>
  );
}

export interface BottomDockProps {
  onNearest: () => void;
  onLocate: () => void;
  distanceLabel: string | null;
  locationShared: boolean;
}

/**
 * "Nearest location" bar pinned to the bottom with the blue locate button
 * floating above its right edge and "Get the app" above its left edge.
 * Swiping up on the bar also finds the nearest.
 */
export function BottomDock({ onNearest, onLocate, distanceLabel, locationShared }: BottomDockProps) {
  const swipeRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  const storeLink = useStoreLink();

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    swipeRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || start.pointerId !== e.pointerId) return;
    const dy = e.clientY - start.y;
    const dx = e.clientX - start.x;
    if (dy < -20 && Math.abs(dx) < 48) {
      // The click that follows a swipe ending on the button must not fire twice.
      swipedRef.current = true;
      setTimeout(() => (swipedRef.current = false), 0);
      onNearest();
    }
  };
  const onButtonClick = () => {
    if (!swipedRef.current) onNearest();
  };

  return (
    <div className="cuub-bottom-dock">
      <a
        className="cuub-get-app-btn"
        href={storeLink.href}
        rel="noopener noreferrer"
        onClick={() => trackGetApp(storeLink, "dock")}
      >
        <img src="/assets/applogo.png" alt="" width={22} height={22} />
        Get the app
      </a>
      <button
        type="button"
        className="cuub-locate-btn"
        aria-label={locationShared ? "Center on my location" : "Enable location"}
        onClick={onLocate}
      >
        <img
          src={locationShared ? "/assets/map/location-arrow.png" : "/assets/map/location-arrow-unshared.png"}
          alt=""
          className={locationShared ? "cuub-locate-arrow" : "cuub-locate-arrow cuub-locate-arrow--unshared"}
        />
      </button>
      <div
        className="cuub-nearest-bar"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipeRef.current = null)}
      >
        <GradientButton
          label="Nearest location"
          onClick={onButtonClick}
          icon={distanceLabel ? <DistancePill label={distanceLabel} /> : null}
        />
      </div>
    </div>
  );
}
