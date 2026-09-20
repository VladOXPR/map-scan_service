"use client";

import { useEffect, useState } from "react";
import type { BatteryData } from "@cuub/shared";
import { cuubClient } from "@/lib/cuubClient";
import { useDurationTimer } from "./useDurationTimer";

const APP_STORE_URL = "https://apps.apple.com/us/app/cuub/id6805257335";

export interface ScanModalProps {
  stickerId: string;
}

export function ScanModal({ stickerId }: ScanModalProps) {
  const [open, setOpen] = useState(false);
  const [battery, setBattery] = useState<BatteryData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [returned, setReturned] = useState(false);

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

  const showDuration = !!battery;
  const initialDuration =
    battery && !returned ? String(battery.duration ?? "00:00:00") : null;
  const duration = useDurationTimer(
    initialDuration,
    showDuration && !returned
  );

  const onGetApp = () => {
    void cuubClient
      .recordAppTap(stickerId)
      .catch((err) => console.error("Error recording app tap:", err));
  };

  if (!loaded || !open) return null;

  return (
    <div
      className={`battery-modal active${showDuration ? "" : " battery-modal--ad-only"}`}
    >
      <div className="battery-content">
        {showDuration && (
          <div className="battery-info battery-duration">
            <div className="battery-label">Duration</div>
            <div className="battery-value">
              {returned ? "Battery returned" : duration}
            </div>
          </div>
        )}
        <div className="battery-app-cta">
          <img
            className="battery-app-logo"
            src="/assets/applogo.png"
            alt="CUUB"
            width={40}
            height={40}
          />
          <a
            className="battery-get-app-btn"
            href={APP_STORE_URL}
            rel="noopener noreferrer"
            onClick={onGetApp}
          >
            Get the App
          </a>
        </div>
      </div>
    </div>
  );
}
