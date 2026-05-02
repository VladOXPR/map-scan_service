"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MapView } from "@/features/map-view/MapView";

function BlankInner() {
  const search = useSearchParams();
  const embedMode = search?.get("embed") === "1";
  return <MapView variant="blank" embedMode={embedMode} />;
}

export default function BlankPage() {
  return (
    <Suspense fallback={null}>
      <BlankInner />
    </Suspense>
  );
}
