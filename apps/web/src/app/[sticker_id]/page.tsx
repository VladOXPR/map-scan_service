"use client";

import { Suspense } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { MapView } from "@/features/map-view/MapView";
import { ScanModal } from "@/features/scan/ScanModal";

const RESERVED = new Set(["map", "blank", "api", "_next", "favicon.ico"]);

function StickerInner({ stickerId }: { stickerId: string }) {
  const search = useSearchParams();
  const embedMode = search?.get("embed") === "1";
  return (
    <>
      <MapView variant="full" stickerId={stickerId} embedMode={embedMode} />
      <ScanModal stickerId={stickerId} />
    </>
  );
}

export default function StickerPage({
  params,
}: {
  params: { sticker_id: string };
}) {
  const stickerId = params.sticker_id;

  if (!stickerId || RESERVED.has(stickerId) || stickerId.includes(".")) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <StickerInner stickerId={stickerId} />
    </Suspense>
  );
}
