"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MapView } from "@/features/map-view/MapView";

function HomeInner() {
  const search = useSearchParams();
  const embedMode = search?.get("embed") === "1";
  return <MapView variant="full" embedMode={embedMode} />;
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
