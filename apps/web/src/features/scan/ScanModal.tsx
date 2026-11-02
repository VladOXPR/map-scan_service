"use client";

import { useEffect, useRef, useState } from "react";
import type { BatteryData } from "@cuub/core";
import { GradientButton } from "@/components/GradientButton";
import { trackGetApp, useStoreLink } from "@/features/app-links/useStoreLink";
import { cuubClient } from "@/lib/cuubClient";
import { useDurationTimer } from "./useDurationTimer";

export interface ScanModalProps {
  stickerId: string;
  /** Rendered height of the card (0 while hidden), for laying out map chrome below it. */
  onHeightChange?: (px: number) => void;
}

export function ScanModal({ stickerId, onHeightChange }: ScanModalProps) {
  const [open, setOpen] = useState(false);
  const [battery, setBattery] = useState<BatteryData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [returned, setReturned] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const storeLink = useStoreLink();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let manufactureId = "";
      let stickerType = "type one";
      try {
        const result = await cuubClient.getBattery(stickerId);
        if (cancelled) return;
        if (result.success && result.data) {
          setBattery(result.data);
          manufactureId = String(result.data.manufacture_id ?? "");
          stickerType = String(result.data.type ?? "type one");
          const isReturned =
            result.data.duration &&
            String(result.data.duration).toLowerCase() === "battery returned";
          setReturned(!!isReturned);
        } else {
          setBattery(null);
        }
      } catch (err) {
        console.error("Error fetching battery data:", err);
        if (!cancelled) setBattery(null);
      }

      // Always create a visit so later Get App taps can mark it (POST …/app).
      if (!cancelled) {
        cuubClient
          .createScanRecord(stickerId, manufactureId, stickerType)
          .catch((err) => console.error("Error creating scan record:", err));
      }

      if (!cancelled) {
        setLoaded(true);
        setOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stickerId]);

  const visible = loaded && open;

  useEffect(() => {
    if (!onHeightChange) return;
    const el = cardRef.current;
    if (!visible || !el) {
      onHeightChange(0);
      return;
    }
    const report = () => onHeightChange(el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, onHeightChange]);

  const showDuration = !!battery;
  const initialDuration =
    battery && !returned ? String(battery.duration ?? "00:00:00") : null;
  const duration = useDurationTimer(initialDuration, showDuration && !returned);

  const onGetApp = () => {
    trackGetApp(storeLink, "scan_card");
    void cuubClient
      .recordAppTap(stickerId)
      .catch((err) => console.error("Error recording app tap:", err));
  };

  if (!visible) return null;

  return (
    <div ref={cardRef} className={`scan-card${showDuration ? "" : " scan-card--promo"}`}>
      {showDuration && (
        <div className="scan-card-stat">
          <div className="scan-card-label">Duration</div>
          <div className={`scan-card-value${returned ? " scan-card-value--returned" : ""}`}>
            {returned ? "Battery returned" : duration}
          </div>
        </div>
      )}
      <div className="scan-card-cta">
        <img
          className="scan-card-logo"
          src="/assets/applogo.png"
          alt="CUUB"
          width={44}
          height={44}
        />
        <GradientButton size="sm" label="Get the App" href={storeLink.href} onClick={onGetApp} />
      </div>
    </div>
  );
}
