import type { ReactElement } from 'react';
import { useCallback } from 'react';
import {
  PaymentSheetError,
  PlatformPay,
  StripeProvider,
  useStripe,
  type SetupParams,
} from '@stripe/stripe-react-native';
import { colors } from '@/theme';
import {
  getMembershipManageUrl,
  getStripePublishableKey,
  STRIPE_MERCHANT_IDENTIFIER,
} from '@/lib/config';
import type { PayableBuyout } from '@/features/rentals/api';
import type { PlanForSale, SubscriptionSetup } from './api';
import { formatMoney } from './api';
import type { CheckoutOutcome, CheckoutPerson } from './types';

export function BillingProvider({ children }: { children: ReactElement }) {
  const publishableKey = getStripePublishableKey();
  if (!publishableKey) return children;
  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier={STRIPE_MERCHANT_IDENTIFIER}
      urlScheme="cuub"
    >
      {children}
    </StripeProvider>
  );
}

export const paymentsSupported = getStripePublishableKey() !== null;

const INTERVAL_UNITS = {
  day: PlatformPay.IntervalUnit.Day,
  month: PlatformPay.IntervalUnit.Month,
  year: PlatformPay.IntervalUnit.Year,
} as const;

/** Apple Pay has no week unit, so a weekly plan bills every 7 days. */
function applePayInterval(interval: string): { unit: keyof typeof INTERVAL_UNITS; count: number } {
  if (interval === 'week') return { unit: 'day', count: 7 };
  if (interval === 'day' || interval === 'year') return { unit: interval, count: 1 };
  return { unit: 'month', count: 1 };
}

const APPEARANCE: SetupParams['appearance'] = {
  colors: {
    primary: colors.primary,
    background: colors.surface,
    componentBackground: colors.elevated,
  },
};

type Sheet = Pick<ReturnType<typeof useStripe>, 'initPaymentSheet' | 'presentPaymentSheet'>;

async function presentSheet(
  { initPaymentSheet, presentPaymentSheet }: Sheet,
  params: SetupParams,
): Promise<CheckoutOutcome> {
  const init = await initPaymentSheet(params);
  if (init.error) {
    return { result: 'failed', errorCode: String(init.error.code), message: init.error.message };
  }

  const presented = await presentPaymentSheet();
  if (!presented.error) return { result: 'completed' };
  if (presented.error.code === PaymentSheetError.Canceled) return { result: 'canceled' };
  return {
    result: 'failed',
    errorCode: presented.error.declineCode ?? String(presented.error.code),
    message: presented.error.message,
  };
}

/** Initializes and presents PaymentSheet for the subscription's first invoice. */
export function useMembershipCheckout() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  return useCallback(
    async (
      setup: SubscriptionSetup,
      plan: PlanForSale,
      person: CheckoutPerson,
    ): Promise<CheckoutOutcome> => {
      const publishableKey = getStripePublishableKey();
      if (!publishableKey) return { result: 'failed', errorCode: 'stripe_not_configured' };

      const intent = setup.clientSecret
        ? { paymentIntentClientSecret: setup.clientSecret }
        : setup.setupClientSecret
          ? { setupIntentClientSecret: setup.setupClientSecret }
          : null;
      if (!intent) return { result: 'failed', errorCode: 'no_client_secret' };

      const amount = (plan.amountCents / 100).toFixed(2);
      const label = `CUUB ${plan.name}`;
      const every = applePayInterval(plan.interval);
      const price = formatMoney(plan.amountCents, plan.currency);
      const params: SetupParams = {
        ...intent,
        merchantDisplayName: 'CUUB',
        customerId: setup.customerId,
        customerEphemeralKeySecret: setup.ephemeralKeySecret,
        returnURL: 'cuub://stripe-redirect',
        style: 'alwaysDark',
        primaryButtonLabel: `Start membership · ${price}/${plan.interval}`,
        defaultBillingDetails: {
          name: person.name ?? undefined,
          phone: person.phone ?? undefined,
        },
        appearance: APPEARANCE,
        // Apple requires the recurring amount in both the cart and the request.
        applePay: {
          merchantCountryCode: 'US',
          cartItems: [{ paymentType: 'Recurring', intervalUnit: every.unit, intervalCount: every.count, label, amount }],
          request: {
            type: PlatformPay.PaymentRequestType.Recurring,
            description: `${plan.name} membership`,
            managementUrl: getMembershipManageUrl(),
            billing: {
              paymentType: PlatformPay.PaymentType.Recurring,
              intervalUnit: INTERVAL_UNITS[every.unit],
              intervalCount: every.count,
              label,
              amount,
            },
            billingAgreement: `You'll be charged ${price} every ${plan.interval} until you cancel. Cancel anytime in the CUUB app under Account.`,
          },
        },
        googlePay: {
          merchantCountryCode: 'US',
          currencyCode: plan.currency.toUpperCase(),
          testEnv: publishableKey.startsWith('pk_test_'),
          label,
          amount,
        },
      };
      return presentSheet({ initPaymentSheet, presentPaymentSheet }, params);
    },
    [initPaymentSheet, presentPaymentSheet],
  );
}

/** Initializes and presents PaymentSheet for the fee on a lost membership power bank. */
export function useLostPowerBankCheckout() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  return useCallback(
    async (checkout: PayableBuyout, person: CheckoutPerson): Promise<CheckoutOutcome> => {
      const publishableKey = getStripePublishableKey();
      if (!publishableKey) return { result: 'failed', errorCode: 'stripe_not_configured' };

      const amount = (checkout.amountCents / 100).toFixed(2);
      const label = 'CUUB lost power bank';
      return presentSheet(
        { initPaymentSheet, presentPaymentSheet },
        {
          paymentIntentClientSecret: checkout.clientSecret,
          merchantDisplayName: 'CUUB',
          customerId: checkout.customerId,
          customerEphemeralKeySecret: checkout.ephemeralKeySecret,
          returnURL: 'cuub://stripe-redirect',
          style: 'alwaysDark',
          primaryButtonLabel: `Pay ${formatMoney(checkout.amountCents, checkout.currency)}`,
          defaultBillingDetails: {
            name: person.name ?? undefined,
            phone: person.phone ?? undefined,
          },
          appearance: APPEARANCE,
          applePay: {
            merchantCountryCode: 'US',
            cartItems: [{ paymentType: PlatformPay.PaymentType.Immediate, label, amount }],
          },
          googlePay: {
            merchantCountryCode: 'US',
            currencyCode: checkout.currency.toUpperCase(),
            testEnv: publishableKey.startsWith('pk_test_'),
            label,
            amount,
          },
        },
      );
    },
    [initPaymentSheet, presentPaymentSheet],
  );
}
