import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { APP_STORE_ID, WEB_HANDOFF_PARAM } from "@cuub/core";
import { cssVariables } from "@cuub/theme";
import { AnalyticsProvider } from "@/features/analytics/AnalyticsProvider";
import { EMBED_HEADER, PAGE_URL_HEADER, appArgumentFor, visitorIdFrom } from "@/lib/requestContext";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

const baseMetadata: Metadata = {
  title: "CUUB Map Service",
  description: "CUUB battery station map and scan service",
  referrer: "strict-origin-when-cross-origin",
};

/** Smart App Banner on every page except Framer embeds; app-argument carries `wv` into the app. */
export async function generateMetadata(): Promise<Metadata> {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  if (requestHeaders.get(EMBED_HEADER) === "1") return baseMetadata;
  const visitorId = visitorIdFrom(cookieStore.get(WEB_HANDOFF_PARAM)?.value);
  return {
    ...baseMetadata,
    itunes: {
      appId: APP_STORE_ID,
      appArgument: appArgumentFor(requestHeaders.get(PAGE_URL_HEADER) ?? "/", visitorId),
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: cssVariables() }} />
      </head>
      <body>
        {children}
        <AnalyticsProvider />
      </body>
    </html>
  );
}
