"use client";

import { useEffect, useRef } from "react";
import type { Station } from "@cuub/shared";
import { buildDirectionsUrl, detectWebPlatform } from "@cuub/shared";

export interface StationModalProps {
  station: Station | null;
  onClose: () => void;
  onHeightChange?: (px: number) => void;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

export function StationModal({
  station,
  onClose,
  onHeightChange,
}: StationModalProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!onHeightChange) return;
    const h = station ? ref.current.offsetHeight : 0;
    onHeightChange(h);
  }, [station, onHeightChange]);

  const handleDirections = () => {
    if (!station) return;
    const platform = detectWebPlatform(navigator.userAgent || "");
    const url = buildDirectionsUrl(station.latitude, station.longitude, platform);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {
        /* noop */
      }
    }, 0);
  };

  const showSlots = !!station && (hasValue(station.filled_slots) || hasValue(station.open_slots));

  return (
    <div ref={ref} className={`station-modal ${station ? "active" : ""}`}>
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title">{station?.title || "Title"}</div>
          {showSlots && (
            <div className="modal-slots">
              <div className="slot-info">
                <div className="slot-icon filled" />
                <div className="slot-text">
                  <span className="slot-number">
                    {hasValue(station?.filled_slots) ? String(station?.filled_slots) : 0}
                  </span>
                  <span>Filled Slots</span>
                </div>
              </div>
              <div className="slot-info">
                <div className="slot-icon open" />
                <div className="slot-text">
                  <span className="slot-number">
                    {hasValue(station?.open_slots) ? String(station?.open_slots) : 0}
                  </span>
                  <span>Open Slots</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="directions-button"
          onClick={handleDirections}
        >
          Get Directions
        </button>
      </div>
    </div>
  );
}
