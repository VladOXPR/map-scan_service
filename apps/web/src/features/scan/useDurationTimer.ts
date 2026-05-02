"use client";

import { useEffect, useRef, useState } from "react";

function parseDurationToSeconds(durationString: string): number {
  const parts = durationString.split(":");
  if (parts.length !== 3) return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseInt(parts[2], 10) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function formatSecondsToDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
}

export function useDurationTimer(
  initialDuration: string | null,
  active: boolean
): string {
  const [display, setDisplay] = useState<string>("00:00:00");
  const totalRef = useRef<number>(0);

  useEffect(() => {
    if (!active || !initialDuration) {
      totalRef.current = 0;
      setDisplay("00:00:00");
      return;
    }
    totalRef.current = parseDurationToSeconds(initialDuration);
    setDisplay(formatSecondsToDuration(totalRef.current));
    const id = setInterval(() => {
      totalRef.current += 1;
      setDisplay(formatSecondsToDuration(totalRef.current));
    }, 1000);
    return () => clearInterval(id);
  }, [initialDuration, active]);

  return display;
}
