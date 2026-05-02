import { useEffect, useState } from "react";
import type { Station } from "@cuub/shared";
import { cuubClient } from "@/lib/cuubClient";

export function useStations() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await cuubClient.getStations();
        if (cancelled) return;
        if (result.success && result.data) {
          setStations(result.data);
        } else {
          setError(result.error ?? "Failed to fetch stations");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to fetch stations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { stations, loading, error };
}
