import type { Metadata } from "next";
import { CrawlFlow } from "@/features/crawl/CrawlFlow";

export const metadata: Metadata = {
  title: "Grab a Free Power-Bank | CUUB",
  robots: { index: false, follow: false },
};

export default function CrawlPage() {
  return <CrawlFlow />;
}
