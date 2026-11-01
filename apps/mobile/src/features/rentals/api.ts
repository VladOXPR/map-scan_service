import { apiGet, apiPost } from '@/lib/apiClient';

/** Why the app cannot unlock right now, most actionable first (server order). */
export type UnlockBlockReason =
  | 'RENTAL_OPEN'
  | 'OFFLINE'
  | 'EMPTY'
  | 'BUSY'
  | 'NO_PROFILE'
  | 'NO_SUBSCRIPTION';

const UNLOCK_BLOCK_REASONS: readonly string[] = [
  'RENTAL_OPEN',
  'OFFLINE',
  'EMPTY',
  'BUSY',
  'NO_PROFILE',
  'NO_SUBSCRIPTION',
] satisfies UnlockBlockReason[];

export function isUnlockBlockReason(value: string): value is UnlockBlockReason {
  return UNLOCK_BLOCK_REASONS.includes(value);
}

export type StationByCode = {
  code: string;
  locationId: string | null;
  title: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  online: boolean;
  charged: number;
  slots: number;
  /** Null when signed out. */
  canUnlock: boolean | null;
  reason: UnlockBlockReason | null;
  reasonMessage: string | null;
};

export type RentalStatus = 'PENDING_UNLOCK' | 'ACTIVE' | 'RETURNED' | 'BOUGHT_OUT' | 'UNLOCK_FAILED';

export type AppRental = {
  rentalId: string;
  rentType: 'SUBSCRIPTION' | 'PAY_PER_USE';
  status: RentalStatus;
  paymentStatus: string | null;
  stationCode: string | null;
  startTitle: string | null;
  returnTitle: string | null;
  slot: number | null;
  startedAt: string;
  endedAt: string | null;
  /** Lost power bank fee frozen at unlock. */
  buyoutCents: number | null;
  chargedCents: number | null;
  currency: string | null;
  cardLast4: string | null;
  cardWallet: string | null;
};

export async function fetchStationByCode(code: string, token: string | null): Promise<StationByCode> {
  const { data } = await apiGet<StationByCode>(`/app/stations/by-code/${encodeURIComponent(code)}`, {
    token,
  });
  return data;
}

export async function requestUnlock(
  token: string,
  input: { stationCode: string; clientEventId: string },
): Promise<AppRental> {
  const { data } = await apiPost<AppRental>('/app/rentals', input, { token });
  return data;
}

export async function fetchRental(token: string, rentalId: string): Promise<AppRental> {
  const { data } = await apiGet<AppRental>(`/app/rentals/${encodeURIComponent(rentalId)}`, { token });
  return data;
}

export async function fetchActiveRental(token: string): Promise<AppRental | null> {
  const { data } = await apiGet<{ rental: AppRental | null }>('/app/rentals/active', { token });
  return data.rental;
}

export type BuyoutCheckout =
  | { status: 'paid' | 'processing'; rentalId: string }
  | {
      status: 'requires_payment';
      rentalId: string;
      amountCents: number;
      currency: string;
      customerId: string;
      ephemeralKeySecret: string;
      clientSecret: string;
    };

export type PayableBuyout = Extract<BuyoutCheckout, { status: 'requires_payment' }>;

/** Pays for a lost membership power bank; ask again after PaymentSheet until `paid`. */
export async function checkoutBuyout(token: string, rentalId: string): Promise<BuyoutCheckout> {
  const { data } = await apiPost<BuyoutCheckout>(
    `/app/rentals/${encodeURIComponent(rentalId)}/buyout`,
    undefined,
    { token },
  );
  return data;
}
