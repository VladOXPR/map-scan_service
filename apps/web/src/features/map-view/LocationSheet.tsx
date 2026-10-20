"use client";

import { useEffect } from "react";

export interface LocationSheetProps {
  open: boolean;
  loading: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}

export function LocationSheet({ open, loading, onContinue, onDismiss }: LocationSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onDismiss]);

  return (
    <div className={`cuub-location-sheet-root${open ? " active" : ""}`} aria-hidden={!open}>
      <div className="cuub-location-sheet-backdrop" onClick={loading ? undefined : onDismiss} />
      <div
        className="cuub-location-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cuubLocationSheetTitle"
      >
        <h2 id="cuubLocationSheetTitle" className="cuub-location-sheet-title">
          Share your location
        </h2>
        <p className="cuub-location-sheet-body">
          CUUB uses your location to show nearby battery stations and center the map on you.
        </p>
        <button
          type="button"
          className="cuub-inverse-btn"
          onClick={onContinue}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? <span className="cuub-spinner" aria-label="Loading" /> : "Continue"}
        </button>
      </div>
    </div>
  );
}
