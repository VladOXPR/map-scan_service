import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Button, GradientButton, Text } from '@/components/ui';
import { colors, motion, radius, spacing } from '@/theme';
import { formatMoney, type Membership } from './api';

const BADGE = 112;
const GRADIENT = ['#22B0F6', '#1F68E0'] as const;
const GLOW = '#2A8CF0';

function paidWith(card: Membership['card']): string | null {
  if (!card) return null;
  if (card.wallet === 'apple_pay') return 'Apple Pay';
  if (card.wallet === 'google_pay') return 'Google Pay';
  if (!card.last4) return null;
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : 'Card';
  return `${brand} •••• ${card.last4}`;
}

function renewsOn(membership: Membership): string | null {
  if (!membership.currentPeriodEnd) return null;
  return new Date(membership.currentPeriodEnd).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
}

function CheckBadge() {
  const badge = useSharedValue(0);
  const check = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    badge.value = withSpring(1, { damping: 11, stiffness: 160 });
    check.value = withDelay(220, withSpring(1, { damping: 9, stiffness: 220 }));
    ring.value = withDelay(
      300,
      withRepeat(
        withSequence(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })),
        3,
      ),
    );
  }, [badge, check, ring]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ scale: 0.4 + badge.value * 0.6 }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.value,
    transform: [{ translateY: -6 }, { rotate: '45deg' }, { scale: check.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 0.5 * (1 - ring.value),
    transform: [{ scale: 1 + ring.value * 0.7 }],
  }));

  return (
    <View style={styles.badgeWrap}>
      <Animated.View style={[styles.ring, ringStyle]} />
      <Animated.View style={[styles.badge, badgeStyle]}>
        <LinearGradient colors={[...GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badgeFill}>
          <Animated.View style={[styles.check, checkStyle]} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text muted>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

type PassActivatedProps = {
  membership: Membership;
  primaryLabel: string;
  onPrimary: () => void;
  onDone: () => void;
};

/** The moment a purchase lands: the Pass is confirmed active by Stripe, not assumed. */
export function PassActivated({ membership, primaryLabel, onPrimary, onDone }: PassActivatedProps) {
  const price =
    membership.amountCents != null && membership.currency
      ? `${formatMoney(membership.amountCents, membership.currency, { showCents: true })} / ${membership.interval ?? 'month'}`
      : null;
  const renews = renewsOn(membership);
  const card = paidWith(membership.card);

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <CheckBadge />
        <Animated.View entering={FadeInDown.delay(350).duration(motion.slow)} style={styles.copy}>
          <Text style={styles.headline}>You're in!</Text>
          <Text muted center>
            Your CUUB Pass is active. Unlock a power bank at any CUUB station at no extra charge.
          </Text>
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.delay(550).duration(motion.slow)} style={styles.card}>
        <Row label="Plan" value={membership.planName ?? 'CUUB Pass'} />
        {price ? <Row label="Price" value={price} /> : null}
        {renews ? <Row label="Renews" value={renews} /> : null}
        {card ? <Row label="Paid with" value={card} /> : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(750).duration(motion.slow)} style={styles.actions}>
        <GradientButton label={primaryLabel} onPress={onPrimary} />
        <Button label="Done" variant="ghost" onPress={onDone} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing[6],
  },
  hero: {
    alignItems: 'center',
    gap: spacing[5],
    paddingTop: spacing[4],
  },
  badgeWrap: {
    width: BADGE,
    height: BADGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 3,
    borderColor: GLOW,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    overflow: 'hidden',
    shadowColor: GLOW,
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  badgeFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 26,
    height: 50,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderColor: colors.white,
    borderBottomRightRadius: 3,
  },
  copy: {
    alignItems: 'center',
    gap: spacing[2],
  },
  headline: {
    color: colors.white,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  rowValue: {
    color: colors.white,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  actions: {
    gap: spacing[3],
  },
});
