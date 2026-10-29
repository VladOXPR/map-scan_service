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
  maxRentHours: number | null;
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
  maxRentHours: number;
  buyoutCents: number;
};

export type UnpaidBuyout = { batteryRentId: string; amountCents: number; error: string | null };

export type Billing = {
  membership: Membership;
  plan: PlanForSale | null;
  unpaidBuyout: UnpaidBuyout | null;
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
  const { data } = await apiGet<Billing>(`/app/billing${refresh ? '?refresh=1' : ''}`, { token });
  return data;
}

export async function startSubscription(token: string): Promise<SubscriptionSetup> {
  const { data } = await apiPost<SubscriptionSetup>('/app/billing/subscription', undefined, { token });
  return data;
}

/** Stripe Customer Portal: update the card or cancel. */
export async function billingPortalUrl(token: string): Promise<string> {
  const { data } = await apiPost<{ url: string }>('/app/billing/portal', undefined, { token });
  return data.url;
}

export function formatMoney(cents: number | null | undefined, currency = 'usd'): string {
  if (cents == null) return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
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
