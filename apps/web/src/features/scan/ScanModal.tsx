"use client";

import { useEffect, useState } from "react";
import type { BatteryData } from "@cuub/shared";
import { cuubClient } from "@/lib/cuubClient";
import { useDurationTimer } from "./useDurationTimer";

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
      try {
        const result = await cuubClient.getBattery(stickerId);
        if (cancelled) return;
        if (result.success && result.data) {
          setBattery(result.data);
          const isReturned =
            result.data.duration &&
            String(result.data.duration).toLowerCase() === "battery returned";
          setReturned(!!isReturned);
          setOpen(true);
          if (result.data.manufacture_id) {
            cuubClient
              .createScanRecord(
                stickerId,
                String(result.data.manufacture_id),
                String(result.data.type ?? "type one")
              )
              .catch((err) =>
                console.error("Error creating scan record:", err)
              );
          }
        } else {
          setBattery(null);
          setOpen(true);
        }
      } catch (err) {
        console.error("Error fetching battery data:", err);
        setBattery(null);
        setOpen(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stickerId]);

  const initialDuration =
    battery && !returned ? String(battery.duration ?? "00:00:00") : null;
  const duration = useDurationTimer(initialDuration, !returned && !!battery);

  if (!loaded) return null;

  const showDurationBlock = !!battery;
  const paid = battery
    ? `$${battery.amountPaid ?? 0}`
    : "$4";

  return (
    <div className={`battery-modal ${open ? "active" : ""}`}>
      <div className="battery-content">
        {showDurationBlock && (
          <div className="battery-info battery-duration">
            <div className="battery-label">Duration</div>
            <div className="battery-value">
              {returned ? "Battery returned" : duration}
            </div>
          </div>
        )}
        <div className="battery-info battery-paid">
          <div className="battery-label">Paid</div>
          <div className="battery-value">{paid}</div>
        </div>
      </div>
    </div>
  );
}
