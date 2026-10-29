const CRAWL_URL = "https://speakeasygo.com/ms/cuub";

/**
 * Crawlloween promotion switch. While on, the ad tops the map and the scan
 * card drops its CUUB logo and "Get the App" button. Set to false when the
 * promotion ends to remove the ad and bring those back.
 */
export const CRAWL_PROMO_ACTIVE = true;

export function CrawlAd() {
  return (
    <a className="crawl-ad" href={CRAWL_URL} target="_blank" rel="noopener noreferrer">
      <img
        className="crawl-ad-logo"
        src="/crawl/crawlloween.webp"
        alt="Crawlloween"
        width={112}
        height={55}
      />
      <span className="crawl-ad-text">
        <span className="crawl-ad-title">15+ bar crawls</span>
        <span className="crawl-ad-sub">Pick yours this Halloween</span>
      </span>
      <span className="crawl-ad-cta">Tickets</span>
    </a>
  );
}
