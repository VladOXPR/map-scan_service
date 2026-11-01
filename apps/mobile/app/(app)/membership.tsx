import { useCallback, useEffect, useRef } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  EmptyState,
  GradientButton,
  LoadingState,
  MembershipChip,
  Text,
} from '@/components/ui';
import { unlockGate } from '@/features/auth/gate';
import { membershipPath, stationPath, type PaywallTrigger } from '@/features/auth/routes';
import { formatMoney, type Billing } from '@/features/billing/api';
import { useBilling, useManageMembership, useSubscribe } from '@/features/billing/hooks';
import { paymentsSupported } from '@/features/billing/stripe';
import { tracker } from '@/lib/analytics';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, rentTypeColors, spacing } from '@/theme';

function isTrigger(value: unknown): value is PaywallTrigger {
  return value === 'unlock' || value === 'account' || value === 'station';
}

function Benefit({ children }: { children: string }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitDot} />
      <Text style={{ flex: 1 }}>{children}</Text>
    </View>
  );
}

export default function MembershipScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ trigger?: string; station?: string }>();
  const trigger: PaywallTrigger = isTrigger(params.trigger) ? params.trigger : 'account';
  const stationCode = typeof params.station === 'string' ? params.station : undefined;
  const session = useAuthStore((s) => s.session);
  const billing = useBilling();
  const { state, subscribe, reset } = useSubscribe();
  const manage = useManageMembership();
  const viewed = useRef(false);

  const gate = unlockGate(session, membershipPath({ trigger, stationCode }));
  const gateTarget = gate.step === 'ready' ? null : JSON.stringify(gate.href);
  useEffect(() => {
    if (gateTarget) router.replace(JSON.parse(gateTarget) as Href);
  }, [gateTarget, router]);

  useEffect(() => {
    if (viewed.current || !billing.data) return;
    viewed.current = true;
    tracker.track('paywall_viewed', { trigger, ...(stationCode ? { stationCode } : {}) });
  }, [billing.data, stationCode, trigger]);

  const fallback = stationCode ? stationPath(stationCode) : '/(app)';
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback as Href);
  }, [fallback, router]);

  useEffect(() => {
    if (state.phase !== 'active') return;
    const timer = setTimeout(close, 900);
    return () => clearTimeout(timer);
  }, [close, state.phase]);

  if (gate.step !== 'ready' || billing.isPending) return <LoadingState />;

  if (billing.isError || !billing.data) {
    return (
      <EmptyState
        title="Couldn't load memberships"
        description="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void billing.refetch()}
      />
    );
  }

  const data: Billing = billing.data;
  const { membership, plan } = data;
  const busy = state.phase === 'preparing' || state.phase === 'paying' || state.phase === 'activating';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={close}
        disabled={busy}
        style={[styles.closeButton, { top: insets.top + spacing[2] }]}
        hitSlop={8}
      >
        <Text style={styles.closeIcon}>×</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, spacing[5]) },
        ]}
        refreshControl={
          <RefreshControl
            tintColor={colors.muted}
            refreshing={billing.isRefetching}
            onRefresh={() => void billing.refetch()}
          />
        }
      >
        <MembershipChip label="CUUB Membership" />

        {membership.active ? (
          <View style={{ gap: spacing[3] }}>
            <Text style={styles.headline}>You're a member</Text>
            <Text muted>
              {membership.cancelAtPeriodEnd && membership.currentPeriodEnd
                ? `Your membership ends on ${new Date(membership.currentPeriodEnd).toLocaleDateString()}.`
                : 'Unlock a power bank at any CUUB station at no extra charge.'}
            </Text>
          </View>
        ) : plan ? (
          <View style={{ gap: spacing[3] }}>
            <Text style={styles.headline}>
              {trigger === 'unlock' ? 'Become a member to unlock' : 'Charge anywhere, anytime'}
            </Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatMoney(plan.amountCents, plan.currency)}</Text>
              <Text muted style={{ marginBottom: 6 }}>
                / {plan.interval}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: spacing[3] }}>
            <Text style={styles.headline}>Memberships are coming soon</Text>
            <Text muted>Check back shortly.</Text>
          </View>
        )}

        {plan && !membership.active ? (
          <View style={styles.card}>
            <Benefit>Unlimited rentals, one power bank at a time</Benefit>
            <Benefit>No timer, no late fees: keep it as long as you need</Benefit>
            <Benefit>Return to any CUUB station</Benefit>
            <Benefit>Cancel anytime</Benefit>
          </View>
        ) : null}

        {state.phase === 'error' ? (
          <Text variant="caption" color={colors.danger}>
            {state.message}
          </Text>
        ) : null}

        {membership.active ? (
          <View style={{ gap: spacing[3] }}>
            {state.phase === 'active' ? (
              <Text variant="subtitle" color={colors.success}>
                Membership active
              </Text>
            ) : null}
            <GradientButton label={stationCode ? 'Back to station' : 'Done'} onPress={close} />
            <Button
              label="Manage membership"
              variant="ghost"
              loading={manage.opening}
              onPress={() => void manage.open()}
            />
          </View>
        ) : plan ? (
          <View style={{ gap: spacing[3] }}>
            {paymentsSupported ? (
              <GradientButton
                label={state.phase === 'error' ? 'Try again' : 'Continue'}
                loading={busy}
                onPress={() => {
                  if (state.phase === 'error') reset();
                  void subscribe(data);
                }}
              />
            ) : (
              <Text muted>Payments aren't available in this build.</Text>
            )}
            {state.phase === 'activating' ? (
              <Text variant="caption" muted center>
                Activating your membership…
              </Text>
            ) : null}
            <Text variant="caption" muted>
              {`Renews every ${plan.interval} at ${formatMoney(plan.amountCents, plan.currency)} until you cancel. ` +
                'Return your power bank to rent the next one. ' +
                `If you lose it, pay the ${formatMoney(plan.buyoutCents, plan.currency)} lost power bank fee to keep unlocking.`}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  closeButton: {
    position: 'absolute',
    left: spacing[5],
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '400',
    marginTop: -1,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[9] + spacing[5],
    gap: spacing[5],
  },
  headline: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
  },
  price: {
    color: colors.white,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '800',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[5],
    gap: spacing[3],
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  benefitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: rentTypeColors.subscription,
  },
});
