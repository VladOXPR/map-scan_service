/**
 * Mirrors cuub-api's ingest rules (`src/services/constants.ts` and
 * `appAnalyticsService.ts`). The server rejects a whole batch for one unknown
 * name or too many property keys, so the tracker enforces both before sending.
 */

export const ANALYTICS_PLATFORMS = ["ios", "android", "web"] as const;
export type AnalyticsPlatform = (typeof ANALYTICS_PLATFORMS)[number];

export const SESSION_SOURCES = ["notification", "organic", "deeplink", "qr_scan", "web_handoff"] as const;
export type SessionSource = (typeof SESSION_SOURCES)[number];

export const SESSION_END_REASONS = ["converted", "abandoned", "idle"] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

export const ANALYTICS_EVENT_NAMES = [
  "app_opened",
  "app_foregrounded",
  "app_backgrounded",
  "session_ended",
  "map_loaded",
  "map_load_failed",
  "map_retry_tapped",
  "location_sheet_shown",
  "location_permission_continue",
  "location_permission_result",
  "find_nearest_tapped",
  "find_nearest_blocked",
  "locate_me_tapped",
  "station_pin_tapped",
  "station_sheet_opened",
  "station_sheet_closed",
  "directions_tapped",
  "directions_confirmed",
  "directions_cancelled",
  "inactive_station_viewed",
  "account_prompt_shown",
  "account_prompt_create",
  "account_prompt_dismissed",
  "account_opened",
  "login_started",
  "login_abandoned",
  "otp_requested",
  "otp_request_failed",
  "otp_verified",
  "logout",
  "account_deleted",
  "support_sms_tapped",
  "privacy_opened",
  "terms_opened",
  "notification_permission_result",
  "low_battery_alert_shown",
  "low_battery_alert_skipped",
  "notification_opened",
  "screen_viewed",
  "page_viewed",
  "deeplink_opened",
  "push_received",
  "permission_prompted",
  "permission_result",
  "api_error",
  "js_error",
  "phone_viewed",
  "otp_failed",
  "profile_viewed",
  "profile_submitted",
  "profile_rejected",
  "paywall_viewed",
  "paywall_cta_tapped",
  "payment_sheet_opened",
  "payment_sheet_result",
  "membership_active_seen",
  "manage_membership_tapped",
  "scanner_opened",
  "qr_scanned",
  "station_viewed",
  "unlock_tapped",
  "unlock_blocked",
  "unlock_result",
  "rental_card_viewed",
  "return_seen",
  "station_landing_viewed",
  "get_app_tapped",
  "open_in_app_tapped",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

const EVENT_NAME_SET: ReadonlySet<string> = new Set(ANALYTICS_EVENT_NAMES);

export function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return EVENT_NAME_SET.has(name);
}

export const MAX_EVENTS_PER_BATCH = 100;
export const MAX_PROPERTY_KEYS = 32;
export const MAX_PROPERTY_BYTES = 4096;
export const MAX_STRING_LENGTH = 200;

/** Dropped by the server anyway; never leave the device. */
export const FORBIDDEN_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  "battery",
  "batteryLevel",
  "batteryPercent",
  "percent",
  "latitude",
  "longitude",
  "lat",
  "lng",
  "coords",
  "gps",
  "phone",
  "expoPushToken",
  "token",
  "firstName",
  "lastName",
  "name",
  "dateOfBirth",
  "dob",
  "code",
  "otp",
]);

export type PropertyValue = string | number | boolean | null;
export type EventProperties = Record<string, PropertyValue | undefined>;

export type DeeplinkSource = "qr_scan" | "universal_link" | "push" | "web_handoff";
export type PermissionKind = "location" | "camera" | "notifications";
export type PermissionResult = "granted" | "denied" | "undetermined" | "blocked";
export type WalletType = "apple_pay" | "google_pay" | "card" | "unknown";
export type MembershipStatus =
  | "none"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

/**
 * Typed properties for the funnel events; everything else accepts any flat
 * object. Keeps the dashboard funnels and PostHog insights on the same keys.
 */
export interface FunnelEventProperties {
  phone_viewed: { entry?: string };
  otp_requested: { resend?: boolean };
  otp_verified: { isNewUser: boolean };
  otp_failed: { reason: string };
  profile_viewed: { trigger: "signup" | "unlock" | "account" };
  profile_submitted: { ageBracket: string };
  profile_rejected: { reason: string };
  paywall_viewed: { trigger: "unlock" | "account" | "station"; stationCode?: string };
  paywall_cta_tapped: { planId?: string };
  payment_sheet_opened: { planId?: string };
  payment_sheet_result: {
    result: "completed" | "canceled" | "failed";
    errorCode?: string;
    wallet?: WalletType;
  };
  membership_active_seen: { status: MembershipStatus };
  manage_membership_tapped: Record<string, never>;
  scanner_opened: { entry: "map" | "station" | "rental_card" };
  qr_scanned: { valid: boolean; stationCode?: string };
  station_viewed: { stationCode: string; canUnlock: boolean | null; reason?: string | null; entry?: DeeplinkSource | "map" };
  unlock_tapped: { stationCode: string };
  unlock_blocked: { stationCode: string; reason: string };
  unlock_result: {
    stationCode: string;
    result: "success" | "failure";
    timeToEjectMs?: number;
    slot?: number;
    reason?: string;
  };
  rental_card_viewed: { rentalId: string; rentType: "SUBSCRIPTION" | "PAY_PER_USE" };
  return_seen: { rentalId: string; durationMinutes?: number };
  station_landing_viewed: { stationCode: string; os: string };
  get_app_tapped: { store: "app_store" | "play_store"; placement: string };
  open_in_app_tapped: { stationCode?: string };
}

export type PropertiesFor<N extends AnalyticsEventName> = N extends keyof FunnelEventProperties
  ? FunnelEventProperties[N] & EventProperties
  : EventProperties;

/** Coarse bracket for PostHog person properties; the birth date never leaves the device. */
export function ageBracket(dateOfBirth: string | Date | null | undefined, now: Date = new Date()): string | null {
  if (!dateOfBirth) return null;
  const dob = typeof dateOfBirth === "string" ? new Date(`${dateOfBirth.slice(0, 10)}T00:00:00Z`) : dateOfBirth;
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  if (age < 13) return null;
  if (age < 18) return "13-17";
  if (age < 25) return "18-24";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55+";
}
