import { NextResponse } from "next/server";
import { APPLE_TEAM_ID, IOS_BUNDLE_ID, STATION_PATH_PREFIX } from "@cuub/core";

export const dynamic = "force-static";

/** iOS universal links: station QR links (`/s/<code>`) open the CUUB app when it is installed. */
export function GET() {
  const appID = `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`;
  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: [appID],
            components: [{ "/": `${STATION_PATH_PREFIX}*`, comment: "Station QR and Open in app" }],
          },
        ],
      },
    },
    { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } },
  );
}
