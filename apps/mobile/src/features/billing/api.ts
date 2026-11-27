import type { MembershipStatus } from '@cuub/core';
import { apiGet, apiPost } from '@/lib/apiClient';

export type Membership = {
  status: MembershipStatus;
  /** May unlock (active or trialing). */
  active: boolean;
  subscriptionId: string | null;
  planName: string | null;
  amountCents: number | null;
  currency: string | null;
  interval: string | null;
  /** What a lost power bank costs. */
  buyoutCents: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  card: { brand: string | null; last4: string | null; wallet: string | null } | null;
  lastPaymentError: string | null;
};

export type PlanForSale = {
  subscriptionPlanId: string;
  name: string;
  amountCents: number;
  currency: string;
  interval: string;
  /** What a lost power bank costs. */
  buyoutCents: number;
};

export type Billing = {
  membership: Membership;
  plan: PlanForSale | null;
};

export type SubscriptionSetup = {
  customerId: string;
  ephemeralKeySecret: string;
  subscriptionId: string;
  clientSecret: string | null;
  setupClientSecret: string | null;
  status: string;
};

/** `refresh` re-reads Stripe first; used right after PaymentSheet so the app does not wait on webhooks. */
export async function fetchBilling(token: string, refresh = false): Promise<Billing> {
  const { data } = await apiGet<Billing>(`/app/billing${refresh ? '?refresh=true' : ''}`, { token });
  return data;
}

export async function startSubscription(token: string): Promise<SubscriptionSetup> {
  const { data } = await apiPost<SubscriptionSetup>('/app/billing/subscription', undefined, { token });
  return data;
}

/** Same codes as cuub-api's SUBSCRIPTION_CANCEL_REASONS; the server refuses anything else. */
export const CANCEL_REASONS = [
  { value: 'TOO_EXPENSIVE', label: 'Too expensive' },
  { value: 'NOT_USING', label: "Don't use it enough" },
  { value: 'NO_STATIONS_NEARBY', label: 'No stations near me' },
  { value: 'POWER_BANK_ISSUES', label: 'Power bank issues' },
  { value: 'TEMPORARY', label: 'Only needed it for a while' },
  { value: 'OTHER', label: 'Other' },
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number]['value'];
export const CANCEL_COMMENT_MAX = 1000;

/** Stops renewal; the Pass keeps working until `currentPeriodEnd`. */
export async function cancelMembership(
  token: string,
  answers: { reasons: CancelReason[]; comment: string | null },
): Promise<Billing> {
  const { data } = await apiPost<Billing>('/app/billing/subscription/cancel', answers, { token });
  return data;
}

export async function resumeMembership(token: string): Promise<Billing> {
  const { data } = await apiPost<Billing>('/app/billing/subscription/resume', undefined, { token });
  return data;
}

/** Stripe Customer Portal: update the card. */
export async function billingPortalUrl(token: string): Promise<string> {
  const { data } = await apiPost<{ url: string }>('/app/billing/portal', undefined, { token });
  return data.url;
}

export function formatMoney(
  cents: number | null | undefined,
  currency = 'usd',
  options: { showCents?: boolean } = {},
): string {
  if (cents == null) return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: options.showCents || cents % 100 !== 0 ? 2 : 0,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function walletLabel(wallet: string | null | undefined): 'apple_pay' | 'google_pay' | 'card' | 'unknown' {
  if (wallet === 'apple_pay') return 'apple_pay';
  if (wallet === 'google_pay') return 'google_pay';
  if (!wallet) return 'card';
  return 'unknown';
}
