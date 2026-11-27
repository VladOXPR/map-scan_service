import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeStationCode, WEB_HANDOFF_PARAM, type DeeplinkSource } from '@cuub/core';
import {
  Button,
  EmptyState,
  GradientButton,
  LoadingState,
  MembershipChip,
  Text,
} from '@/components/ui';
import { unlockGate } from '@/features/auth/gate';
import { membershipPath, profileHref, stationPath } from '@/features/auth/routes';
import { formatMoney } from '@/features/billing/api';
import { useBilling } from '@/features/billing/hooks';
import { paymentsSupported } from '@/features/billing/stripe';
import type { StationByCode } from '@/features/rentals/api';
import { useActiveRental, usePayLostPowerBank, useStationByCode } from '@/features/rentals/hooks';
import { tracker } from '@/lib/analytics';
import { ApiError } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, spacing } from '@/theme';

const stationImage = require('@cuub/assets/illustrations/Station_on_stand.png');

type Entry = DeeplinkSource | 'map';
const ENTRIES: Entry[] = ['qr_scan', 'universal_link', 'push', 'web_handoff', 'map'];
/** Arrivals from a station's QR code: the in-app scanner, the phone's camera, or the website handing off. */
const FROM_QR: Entry[] = ['qr_scan', 'universal_link', 'web_handoff'];

function availabilityLabel(station: StationByCode): { text: string; color: string } {
  if (!station.online) return { text: 'Offline', color: colors.danger };
  if (station.charged === 0) return { text: 'No power banks available', color: colors.muted };
  return {
    text: station.charged === 1 ? '1 power bank available' : `${station.charged} power banks available`,
    color: colors.success,
  };
}

export default function StationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string; entry?: string; [WEB_HANDOFF_PARAM]?: string }>();
  const code = normalizeStationCode(typeof params.code === 'string' ? params.code : null);
  // Universal links (`https://<host>/s/<code>`) arrive without `entry`; the deep link itself is tracked in useAnalyticsLifecycle.
  const entry: Entry = ENTRIES.includes(params.entry as Entry)
    ? (params.entry as Entry)
    : params[WEB_HANDOFF_PARAM]
      ? 'web_handoff'
      : 'universal_link';
  const session = useAuthStore((s) => s.session);
  const station = useStationByCode(code);
  const billing = useBilling();
  const activeRental = useActiveRental();
  const { state: lostFee, pay: payLostFee } = usePayLostPowerBank();
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current || !station.data) return;
    viewed.current = true;
    tracker.track(
      'station_viewed',
      {
        stationCode: station.data.code,
        canUnlock: station.data.canUnlock,
        reason: station.data.reason,
        entry,
      },
      station.data.locationId ? { locationId: station.data.locationId } : undefined,
    );
  }, [entry, station.data]);

  const fromQr = FROM_QR.includes(entry);
  const isMember = billing.data?.membership.active ?? false;
  /** Set when a scan sent the person on to the membership page; true again once they're back here. */
  const sentToPaywall = useRef(false);
  const [backFromPaywall, setBackFromPaywall] = useState(false);
  /** The scanner is playing an automatic unlock on top; once it closes back here the station shows. */
  const [autoUnlocking, setAutoUnlocking] = useState(false);

  const { refetch: refetchStation } = station;
  useFocusEffect(
    useCallback(() => {
      if (viewed.current) void refetchStation();
      if (sentToPaywall.current) setBackFromPaywall(true);
      setAutoUnlocking(false);
    }, [refetchStation]),
  );

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/(app)');
  }, [router]);

  /** Every unlock plays the scanner's release over this screen: the spinning diamond, then the power bank sliding out. */
  const startUnlock = useCallback(() => {
    if (code) router.push({ pathname: '/scan', params: { entry: 'station', unlock: code } });
  }, [code, router]);

  // A scanned station unlocks as soon as nothing is in the way: the in-app scanner lands here only when
  // something was (membership, the lost power bank fee, a busy cabinet), the phone's camera and the website always do.
  // Links opened from the map keep the Unlock button: they don't prove the person is at the station.
  const autoUnlocked = useRef(false);
  const canUnlockNow = station.data?.canUnlock === true;
  useEffect(() => {
    if (!fromQr || autoUnlocked.current || !canUnlockNow) return;
    autoUnlocked.current = true;
    setAutoUnlocking(true);
    startUnlock();
  }, [canUnlockNow, fromQr, startUnlock]);

  // Someone who scanned a station goes straight on to what stands between them and a power bank:
  // signing up (which returns here), then the membership page. Closing that without joining leaves the station.
  const forwarded = useRef(false);
  useEffect(() => {
    const data = station.data;
    if (forwarded.current || !data || !fromQr) return;
    if (data.reason && data.reason !== 'NO_PROFILE' && data.reason !== 'NO_SUBSCRIPTION') return;
    const gate = unlockGate(session, stationPath(data.code, entry));
    if (gate.step !== 'ready') {
      forwarded.current = true;
      router.replace(gate.href);
      return;
    }
    if (data.reason !== 'NO_SUBSCRIPTION' || !billing.data?.plan) return;
    forwarded.current = true;
    sentToPaywall.current = true;
    router.push(membershipPath({ trigger: 'unlock', stationCode: data.code }) as Href);
  }, [billing.data, entry, fromQr, router, session, station.data]);

  useEffect(() => {
    if (backFromPaywall && !isMember) leave();
  }, [backFromPaywall, isMember, leave]);

  if (!code) {
    return (
      <EmptyState
        title="That isn't a CUUB station"
        description="Scan the QR code on the front of a CUUB station."
        actionLabel="Back to map"
        onAction={() => router.dismissTo('/(app)')}
      />
    );
  }

  if (station.isPending) return <LoadingState />;

  if (station.isError || !station.data) {
    const notFound = station.error instanceof ApiError && station.error.status === 404;
    return (
      <EmptyState
        title={notFound ? 'Station not found' : "Couldn't load this station"}
        description={notFound ? 'This code does not match a CUUB station.' : 'Check your connection and try again.'}
        actionLabel={notFound ? 'Back to map' : 'Try again'}
        onAction={() => (notFound ? router.dismissTo('/(app)') : void station.refetch())}
      />
    );
  }

  const data = station.data;
  const returnTo = stationPath(data.code, entry);
  const gate = unlockGate(session, returnTo);
  const plan = billing.data?.plan ?? null;
  const blockedOnAccount = !data.reason || data.reason === 'NO_PROFILE' || data.reason === 'NO_SUBSCRIPTION';

  // A scan that is about to sign in, join, or unlock never shows the station itself.
  const handingOff =
    fromQr &&
    ((gate.step !== 'ready' && blockedOnAccount) ||
      (data.canUnlock && (!autoUnlocked.current || autoUnlocking)) ||
      (backFromPaywall && !isMember) ||
      (data.reason === 'NO_SUBSCRIPTION' && (billing.isPending || plan !== null)));
  if (handingOff) return <LoadingState />;
  const availability = availabilityLabel(data);
  const reason = data.reason;
  const openRental = activeRental.data ?? null;
  const lostRental =
    openRental?.status === 'ACTIVE' && openRental.rentType === 'SUBSCRIPTION' && openRental.buyoutCents != null
      ? openRental
      : null;
  const payingLostFee =
    lostFee.phase === 'preparing' || lostFee.phase === 'paying' || lostFee.phase === 'confirming';
  const lostFeeError = lostFee.phase === 'error' ? lostFee.message : null;

  const blockedTap = (why: string) => tracker.track('unlock_blocked', { stationCode: data.code, reason: why });

  const renderAction = () => {
    if (gate.step === 'sign_in') {
      return (
        <GradientButton
          label="Sign in to unlock"
          onPress={() => {
            blockedTap('signed_out');
            router.push(gate.href);
          }}
        />
      );
    }
    if (gate.step === 'profile') {
      return (
        <GradientButton
          label="Finish your profile"
          onPress={() => {
            blockedTap('NO_PROFILE');
            router.push(gate.href);
          }}
        />
      );
    }
    switch (reason) {
      case 'NO_SUBSCRIPTION':
        return (
          <GradientButton
            label={
              plan
                ? `Get Pass · ${formatMoney(plan.amountCents, plan.currency)}/${plan.interval}`
                : 'Get Pass'
            }
            onPress={() => {
              blockedTap('NO_SUBSCRIPTION');
              router.push(membershipPath({ trigger: 'unlock', stationCode: data.code }) as Href);
            }}
          />
        );
      case 'RENTAL_OPEN':
        return (
          <>
            {lostRental && paymentsSupported ? (
              <GradientButton
                label={
                  lostFeeError
                    ? 'Try again'
                    : `Lost it? Pay ${formatMoney(lostRental.buyoutCents, lostRental.currency ?? 'usd')}`
                }
                loading={payingLostFee}
                onPress={() => {
                  blockedTap('RENTAL_OPEN');
                  void payLostFee(lostRental.rentalId);
                }}
              />
            ) : null}
            <Button
              label="Back to map"
              variant="secondary"
              disabled={payingLostFee}
              onPress={() => router.dismissTo('/(app)')}
            />
          </>
        );
      case 'NO_PROFILE':
        return (
          <GradientButton
            label="Finish your profile"
            onPress={() => {
              blockedTap('NO_PROFILE');
              router.push(profileHref({ trigger: 'unlock', next: returnTo }));
            }}
          />
        );
      case 'OFFLINE':
      case 'EMPTY':
      case 'BUSY':
        return (
          <Button
            label={reason === 'BUSY' ? 'Try again' : 'Find another station'}
            variant="secondary"
            onPress={() => {
              blockedTap(reason);
              if (reason === 'BUSY') void station.refetch();
              else router.dismissTo('/(app)');
            }}
          />
        );
      default:
        return <GradientButton label="Unlock" onPress={startUnlock} />;
    }
  };

  const message =
    lostFee.phase === 'confirming'
      ? 'Confirming your payment…'
      : lostFeeError
        ? lostFeeError
        : reason && gate.step === 'ready'
          ? data.reasonMessage
          : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={leave}
        disabled={payingLostFee}
        style={[styles.closeButton, { top: insets.top + spacing[2] }]}
        hitSlop={8}
      >
        <Text style={styles.closeIcon}>×</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing[5]) }]}
      >
        <Image source={stationImage} style={styles.image} resizeMode="contain" />

        <View style={styles.block}>
          {isMember ? <MembershipChip label="Pass" /> : null}
          <Text style={styles.headline}>{data.title ?? 'CUUB station'}</Text>
          {data.address ? <Text muted>{data.address}</Text> : null}
          <View style={styles.availability}>
            <View style={[styles.dot, { backgroundColor: availability.color }]} />
            <Text variant="caption" color={availability.color}>
              {availability.text}
            </Text>
          </View>
        </View>

        {message ? (
          <Text variant="caption" color={lostFeeError ? colors.danger : colors.muted}>
            {message}
          </Text>
        ) : null}

        <View style={{ gap: spacing[3] }}>
          {renderAction()}
          {isMember && reason !== 'RENTAL_OPEN' ? (
            <Text variant="caption" muted center>
              Included in your Pass. Keep it as long as you need.
            </Text>
          ) : null}
          <Text variant="caption" muted center>
            {`Station ${data.code}`}
          </Text>
        </View>
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
    paddingTop: spacing[9] + spacing[3],
    gap: spacing[5],
  },
  image: {
    alignSelf: 'center',
    width: 180,
    height: 220,
  },
  block: {
    gap: spacing[2],
  },
  headline: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  availability: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
});
