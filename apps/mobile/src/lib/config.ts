const DEFAULT_API_URL = 'https://platform.cuub.tech';
const DEFAULT_PRIVACY_URL = 'https://cuub.tech/privacypolicy';
const DEFAULT_SUPPORT_URL = 'https://cuub.tech/contact';
const DEFAULT_TERMS_URL = 'https://cuub.tech/termsandconditions';

export function getApiBaseUrl() {
  const raw = process.env.EXPO_PUBLIC_CUUB_API_URL?.trim();
  if (!raw) return DEFAULT_API_URL;
  return raw.replace(/\/$/, '');
}

/** Public privacy policy (required for App Store Connect + in-app disclosure). */
export function getPrivacyPolicyUrl() {
  return (
    process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() || DEFAULT_PRIVACY_URL
  );
}

/** Public support / help page (https required for App Store Connect). */
export function getSupportUrl() {
  return process.env.EXPO_PUBLIC_SUPPORT_URL?.trim() || DEFAULT_SUPPORT_URL;
}

/** Support phone (E.164). Used by the map Support button. */
export function getSupportPhoneE164() {
  return (
    process.env.EXPO_PUBLIC_SUPPORT_PHONE?.trim() || '+14642377449'
  );
}

const DEFAULT_LINK_HOST = 'go.cuub.tech';

/**
 * Hosts whose `/s/<code>` links the app accepts (kiosk QR, universal links).
 * Must match the QR host, the AASA / assetlinks files and associatedDomains.
 */
export function getLinkHosts(): string[] {
  const raw: string | undefined = process.env.EXPO_PUBLIC_LINK_HOSTS?.trim();
  if (!raw) return [DEFAULT_LINK_HOST];
  return raw
    .split(',')
    .map((host: string) => host.trim().toLowerCase())
    .filter(Boolean);
}

/** Origin used to build station links shared from the app. */
export function getLinkOrigin(): string {
  return `https://${getLinkHosts()[0]}`;
}

/** Terms of use linked at signup. */
export function getTermsUrl() {
  return process.env.EXPO_PUBLIC_TERMS_URL?.trim() || DEFAULT_TERMS_URL;
}

/** Stripe publishable key; memberships are disabled in the UI when unset. */
export function getStripePublishableKey(): string | null {
  return process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
}

export const STRIPE_MERCHANT_IDENTIFIER = 'merchant.tech.cuub.user';

/** Shown by Apple Pay on recurring payments as the place to manage the membership. */
export function getMembershipManageUrl() {
  return process.env.EXPO_PUBLIC_MEMBERSHIP_MANAGE_URL?.trim() || getSupportUrl();
}
