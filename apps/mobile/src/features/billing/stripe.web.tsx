import type { ReactElement } from 'react';
import { useCallback } from 'react';
import type { CheckoutOutcome } from './types';

/** PaymentSheet is native only; the web build points people to the app stores instead. */
export function BillingProvider({ children }: { children: ReactElement }) {
  return children;
}

export const paymentsSupported = false;

export function useMembershipCheckout() {
  return useCallback(
    async (..._args: unknown[]): Promise<CheckoutOutcome> => ({
      result: 'failed',
      errorCode: 'unsupported_platform',
    }),
    [],
  );
}
