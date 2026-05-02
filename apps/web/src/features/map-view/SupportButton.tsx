"use client";

import { useEffect, useState } from "react";
import { buildSupportSmsUrl } from "@cuub/shared";

export interface SupportButtonProps {
  stickerId?: string | null;
  liftedBottomPx?: number;
}

export function SupportButton({ stickerId, liftedBottomPx }: SupportButtonProps) {
  const [phone, setPhone] = useState<string>("+14642377449");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/support-phone")
      .then((res) => res.json())
      .then((data: { phone?: string }) => {
        if (!cancelled && data.phone) setPhone(data.phone);
      })
      .catch(() => {
        /* keep default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onClick = () => {
    const url = buildSupportSmsUrl(phone, stickerId ?? null);
    window.location.href = url;
  };

  const style = liftedBottomPx
    ? { bottom: `${liftedBottomPx}px` }
    : undefined;

  return (
    <button
      type="button"
      className="support-button"
      onClick={onClick}
      title="Contact Support"
      style={style}
    >
      <span className="support-text">Text Support</span>
    </button>
  );
}
