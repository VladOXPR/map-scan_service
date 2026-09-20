"use client";

import { useEffect, useState } from "react";

const SHOW_MS = 1500;
const FADE_MS = 400;

export interface AppPromptModalProps {
  /** When true, never auto-open (e.g. embed Mode). */
  disabled?: boolean;
  /** Kept for call-site compatibility; splash does not record taps. */
  stickerId?: string | null;
}

export function AppPromptModal({ disabled = false }: AppPromptModalProps) {
  const [open, setOpen] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (disabled) return;

    const showT = setTimeout(() => {
      setFading(false);
      setOpen(true);
    }, 400);

    return () => clearTimeout(showT);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;

    const fadeT = setTimeout(() => setFading(true), SHOW_MS);
    const hideT = setTimeout(() => {
      setOpen(false);
      setFading(false);
    }, SHOW_MS + FADE_MS);

    return () => {
      clearTimeout(fadeT);
      clearTimeout(hideT);
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className={`cuub-return-splash-backdrop${fading ? " fading" : ""}`}
        aria-hidden="true"
      />
      <div
        className={`cuub-return-splash${fading ? " fading" : ""}`}
        role="status"
        aria-live="polite"
        aria-labelledby="cuubReturnSplashTitle"
      >
        <h2 id="cuubReturnSplashTitle" className="cuub-return-splash-title">
          Return anywhere
        </h2>
        <img
          className="cuub-return-splash-illu"
          src="/assets/returnillu.png"
          alt=""
          width={140}
          height={140}
        />
      </div>
    </>
  );
}
