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

/** Terms of use linked at signup. */
export function getTermsUrl() {
  return process.env.EXPO_PUBLIC_TERMS_URL?.trim() || DEFAULT_TERMS_URL;
}
