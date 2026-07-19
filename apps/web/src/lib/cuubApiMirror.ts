/**
 * Fire-and-forget dual-post of physical QR scans to cuub-api (site_visits).
 * Legacy api.cuub.tech remains the primary scan backend; mirror failures never
 * block the user-facing response.
 */
export function isCuubApiMirrorEnabled(): boolean {
  const flag = process.env.CUUB_API_MIRROR_ENABLED;
  return flag === "true" || flag === "1";
}

export function mirrorScanToCuubApi(
  stickerId: string,
  manufactureId?: string | null
): void {
  if (!isCuubApiMirrorEnabled()) {
    return;
  }

  const baseUrl = process.env.CUUB_API_URL?.trim();
  const token = process.env.CUUB_API_TOKEN?.trim();
  if (!baseUrl || !token) {
    console.warn(
      "[cuub-api mirror] CUUB_API_MIRROR_ENABLED but CUUB_API_URL or CUUB_API_TOKEN is missing"
    );
    return;
  }

  const url = `${baseUrl.replace(/\/$/, "")}/battery/${encodeURIComponent(stickerId)}`;

  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(manufactureId ? { manufacture_id: manufactureId } : {}),
    },
    body: "{}",
    cache: "no-store",
  })
    .then(async (res) => {
      if (res.status === 201) {
        console.log(`[cuub-api mirror] scan recorded for ${stickerId}`);
        return;
      }
      const body = (await res.text()).slice(0, 300);
      console.warn(
        `[cuub-api mirror] ${stickerId} -> HTTP ${res.status}: ${body}`
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[cuub-api mirror] ${stickerId} network error:`, message);
    });
}
