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
import { colors, radius, spacing } from '@/theme';

function isTrigger(value: unknown): value is PaywallTrigger {
  return value === 'unlock' || value === 'account' || value === 'station' || value === 'signup';
}

const STEP_TILE = 32;

const STEPS = [
  { title: 'Unlimited Access', body: 'Unlock through the app.' },
  { title: 'One at a time', body: 'Return then grab another one' },
  { title: 'Total Freedom', body: 'Take anywhere, go anywhere' },
] as const;

function Steps() {
  return (
    <View style={styles.card}>
      {STEPS.map((step, i) => {
        const last = i === STEPS.length - 1;
        return (
          <View key={step.title} style={styles.step}>
            <View style={styles.stepRail}>
              <View style={styles.stepTile}>
                <Text style={styles.stepNumber}>{i + 1}</Text>
              </View>
              {last ? null : <View style={styles.stepConnector} />}
            </View>
            <View style={[styles.stepText, !last && { paddingBottom: spacing[4] }]}>
              <View style={styles.stepTitleRow}>
                <Text variant="subtitle" style={{ fontWeight: '700' }}>
                  {step.title}
                </Text>
              </View>
              <Text muted>{step.body}</Text>
            </View>
          </View>
        );
      })}
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

  // A new member goes straight to scanning; one who came from a station goes back to unlock it there.
  useEffect(() => {
    if (state.phase !== 'active') return;
    const timer = setTimeout(() => {
      if (stationCode) close();
      else router.replace({ pathname: '/scan', params: { entry: 'membership' } });
    }, 900);
    return () => clearTimeout(timer);
  }, [close, router, state.phase, stationCode]);

  if (gate.step !== 'ready' || billing.isPending) return <LoadingState />;

  if (billing.isError || !billing.data) {
    return (
      <EmptyState
        title="Couldn't load CUUB Pass"
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
        <MembershipChip label="Pass" />

        {membership.active ? (
          <View style={{ gap: spacing[3] }}>
            <Text style={styles.headline}>You have a Pass</Text>
            <Text muted>
              {membership.cancelAtPeriodEnd && membership.currentPeriodEnd
                ? `Your Pass ends on ${new Date(membership.currentPeriodEnd).toLocaleDateString()}.`
                : 'Unlock a power bank at any CUUB station at no extra charge.'}
            </Text>
          </View>
        ) : plan ? (
          <View style={{ gap: spacing[3] }}>
            <Text style={styles.headline}>Charge anywhere, anytime</Text>
          </View>
        ) : (
          <View style={{ gap: spacing[3] }}>
            <Text style={styles.headline}>CUUB Pass is coming soon</Text>
            <Text muted>Check back shortly.</Text>
          </View>
        )}

        {plan && !membership.active ? <Steps /> : null}

        {state.phase === 'error' ? (
          <Text variant="caption" color={colors.danger}>
            {state.message}
          </Text>
        ) : null}

        {membership.active ? (
          <View style={{ gap: spacing[3] }}>
            {state.phase === 'active' ? (
              <Text variant="subtitle" color={colors.success}>
                Pass active
              </Text>
            ) : null}
            <GradientButton label={stationCode ? 'Back to station' : 'Done'} onPress={close} />
            <Button
              label="Manage Pass"
              variant="ghost"
              loading={manage.opening}
              onPress={() => void manage.open()}
            />
          </View>
        ) : plan ? (
          <View style={{ gap: spacing[3] }}>
            {paymentsSupported ? (
              <GradientButton
                label={
                  state.phase === 'error'
                    ? 'Try again'
                    : `${formatMoney(plan.amountCents, plan.currency, { showCents: true })} / ${plan.interval}`
                }
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
                Activating your Pass…
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[5],
  },
  step: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  stepRail: {
    width: STEP_TILE,
    alignItems: 'center',
  },
  stepTile: {
    width: STEP_TILE,
    height: STEP_TILE,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    color: '#4A5257',
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
  },
  stepConnector: {
    flex: 1,
    width: 4,
    marginVertical: 3,
    backgroundColor: colors.white,
  },
  stepText: {
    flex: 1,
  },
  stepTitleRow: {
    minHeight: STEP_TILE,
    justifyContent: 'center',
  },
});
