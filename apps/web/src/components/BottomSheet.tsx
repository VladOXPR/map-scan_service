"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

/** Same snap points as the user app's station sheet (share of screen height). */
const SNAP_FRACTIONS = [0.48, 0.58] as const;
export const SHEET_ANIMATION_MS = 220;
const DRAG_SLOP_PX = 6;
const VELOCITY_PROJECTION_MS = 150;

type DragState = {
  pointerId: number;
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
  active: boolean;
};

export interface BottomSheetProps {
  open: boolean;
  /** User dragged the sheet down or pressed Escape. */
  onRequestClose: () => void;
  /** Close animation finished. */
  onClosed?: () => void;
  onVisibleHeightChange?: (px: number) => void;
  label?: string;
  className?: string;
  children: ReactNode;
}

function useViewportHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return height;
}

/**
 * Non-modal bottom sheet: no backdrop, the map stays interactive above it.
 * Opens at 48% of the viewport, drags up to 58%, drag down to dismiss.
 */
export function BottomSheet({
  open,
  onRequestClose,
  onClosed,
  onVisibleHeightChange,
  label,
  className,
  children,
}: BottomSheetProps) {
  const viewportHeight = useViewportHeight();
  const heights = SNAP_FRACTIONS.map((f) => Math.round(viewportHeight * f));
  const maxHeight = heights[heights.length - 1];

  const [snap, setSnap] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (open) setSnap(0);
  }, [open]);

  const visibleHeight = open ? heights[snap] : 0;

  useEffect(() => {
    onVisibleHeightChange?.(visibleHeight);
  }, [visibleHeight, onVisibleHeightChange]);

  useEffect(() => {
    if (open || !onClosed) return;
    const t = setTimeout(onClosed, SHEET_ANIMATION_MS + 30);
    return () => clearTimeout(t);
  }, [open, onClosed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRequestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onRequestClose]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      active: false,
    };
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dy = e.clientY - drag.startY;
    if (!drag.active) {
      if (Math.abs(dy) < DRAG_SLOP_PX) return;
      drag.active = true;
      setDragging(true);
      sheetRef.current?.setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (e.clientY - drag.lastY) / dt;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    setDragOffset(dy);
  }, []);

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || !drag.active || drag.pointerId !== e.pointerId) return;
      setDragging(false);
      setDragOffset(0);

      const projected =
        visibleHeight - (e.clientY - drag.startY) - drag.velocity * VELOCITY_PROJECTION_MS;
      const candidates = [0, ...heights];
      let best = 0;
      for (let i = 1; i < candidates.length; i++) {
        if (Math.abs(candidates[i] - projected) < Math.abs(candidates[best] - projected)) {
          best = i;
        }
      }
      if (best === 0) onRequestClose();
      else setSnap(best - 1);
    },
    [heights, visibleHeight, onRequestClose]
  );

  let translateY = maxHeight - visibleHeight + dragOffset;
  if (translateY < 0) translateY *= 0.3;
  if (!open) translateY = maxHeight + 40;

  return (
    <div
      ref={sheetRef}
      className={`cuub-sheet${className ? ` ${className}` : ""}`}
      role="region"
      aria-label={label}
      aria-hidden={!open}
      style={{
        height: maxHeight,
        transform: `translate3d(0, ${translateY}px, 0)`,
        visibility: open ? "visible" : "hidden",
        transition: dragging
          ? "none"
          : `transform ${SHEET_ANIMATION_MS}ms cubic-bezier(0.33, 1, 0.68, 1), visibility 0s linear ${open ? 0 : SHEET_ANIMATION_MS}ms`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="cuub-sheet-handle" aria-hidden="true" />
      {children}
    </div>
  );
}
