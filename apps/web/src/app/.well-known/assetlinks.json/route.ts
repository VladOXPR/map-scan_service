import { NextResponse } from "next/server";
import { ANDROID_PACKAGE } from "@cuub/core";

export const dynamic = "force-dynamic";

/**
 * Android App Links verification for `/s/<code>`. Fingerprints come from
 * ANDROID_SHA256_CERT_FINGERPRINTS (comma separated): the Play App Signing key
 * from Play Console, plus the EAS upload key for internal builds.
 */
export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));

  return NextResponse.json(
    fingerprints.length
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: ANDROID_PACKAGE,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
