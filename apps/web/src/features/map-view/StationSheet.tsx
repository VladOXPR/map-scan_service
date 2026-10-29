"use client";

import type { Coords, Station } from "@cuub/core";
import { distanceMiles, formatMiles, getStationDetails } from "@cuub/core";
import { BottomSheet } from "@/components/BottomSheet";
import { DistancePill } from "@/components/DistancePill";
import { GradientButton } from "@/components/GradientButton";
import { openDirections } from "./directions";

export interface StationSheetProps {
  /** Kept by the parent until `onClosed` so content stays during the slide-out. */
  station: Station | null;
  open: boolean;
  /** Origin for the distance pill (user location, or a searched address). */
  distanceFrom: Coords | null;
  onRequestClose: () => void;
  onClosed?: () => void;
  onVisibleHeightChange?: (px: number) => void;
}

export function StationSheet({
  station,
  open,
  distanceFrom,
  onRequestClose,
  onClosed,
  onVisibleHeightChange,
}: StationSheetProps) {
  const details = station ? getStationDetails(station) : null;
  const distanceLabel =
    details?.coords && distanceFrom
      ? formatMiles(distanceMiles(distanceFrom, details.coords))
      : "—";
  const tall = (details?.slotCount ?? 0) >= 24;

  return (
    <BottomSheet
      open={open && !!station}
      onRequestClose={onRequestClose}
      onClosed={onClosed}
      onVisibleHeightChange={onVisibleHeightChange}
      label={station?.name || "CUUB Station"}
      className="station-sheet"
    >
      {station && details && (
        <div className="station-sheet-body">
          <div className="station-sheet-header">
            <div className="station-sheet-title-row">
              <h2 className="station-sheet-title">{station.name || "CUUB Station"}</h2>
              {!details.unavailable && <DistancePill label={distanceLabel} />}
            </div>
            <div className="station-sheet-divider" />
          </div>

          <div className="station-sheet-info">
            <div className="station-sheet-copy">
              <div className="station-sheet-type">{details.slotCount} slot station</div>
              {details.hasLive && (
                <div className="station-sheet-stats">
                  <div className="station-sheet-stat">
                    <span className="station-sheet-badge station-sheet-badge--blue">
                      {details.powerbanks}
                    </span>
                    <span className="station-sheet-stat-label">Powerbanks</span>
                  </div>
                  <div className="station-sheet-stat">
                    <span className="station-sheet-badge station-sheet-badge--grey">
                      {details.slotsToReturn}
                    </span>
                    <span className="station-sheet-stat-label">Slots to return</span>
                  </div>
                </div>
              )}
            </div>
            <img
              className={`station-sheet-hero${tall ? " station-sheet-hero--tall" : ""}`}
              src={tall ? "/assets/illustrations/Tall.png" : "/assets/illustrations/Station_on_stand.png"}
              alt=""
              draggable={false}
            />
          </div>

          <GradientButton
            label={details.unavailable ? "Location Inactive" : "Get Directions"}
            disabled={details.unavailable}
            onClick={() => openDirections(station)}
          />
        </div>
      )}
    </BottomSheet>
  );
}
