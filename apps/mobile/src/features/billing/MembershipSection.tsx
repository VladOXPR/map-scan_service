import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { colors, motion, radius, spacing } from '@/theme';
import type { Membership } from './api';
import { useBilling, useManageMembership } from './hooks';
import { ManagePassSheet } from './ManagePassSheet';

const passCube = require('@cuub/assets/illustrations/PassCube.png');

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const CARD_GRADIENT = ['#212121', '#111111'] as const;
const ACTIVE_PILL_GRADIENT = ['#22B1F7', '#1F67E0'] as const;
const ACTIVATE_GRADIENT = ['#22AFF6', '#2879FF'] as const;
const OUTLINE = '#333333';

const STATUS_COPY: Partial<Record<Membership['status'], string>> = {
  past_due: 'Payment failed. Update your card to keep unlocking.',
  unpaid: 'Payment failed. Update your card to keep unlocking.',
  incomplete: 'Checkout was not finished.',
  canceled: 'Your Pass has ended.',
};

function cardLabel(card: Membership['card']): string | null {
  if (!card) return null;
  if (card.wallet === 'apple_pay') return card.last4 ? `Apple Pay - ${card.last4}` : 'Apple Pay';
  if (card.wallet === 'google_pay') return card.last4 ? `Google Pay - ${card.last4}` : 'Google Pay';
  if (!card.last4) return null;
  const brand = card.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : 'Card';
  return `${brand} - ${card.last4}`;
}

function StatusPill({ active }: { active: boolean }) {
  if (!active) {
    return (
      <View style={[styles.pill, styles.pillInactive]}>
        <Text variant="caption" color="#A3A3A3" style={styles.pillLabel}>
          Inactive
        </Text>
      </View>
    );
  }
  return (
    <LinearGradient
      colors={[...ACTIVE_PILL_GRADIENT]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[styles.pill, styles.pillActive]}
    >
      <Text variant="caption" color={colors.white} style={styles.pillLabel}>
        Active
      </Text>
    </LinearGradient>
  );
}

function PassButton({
  label,
  tone,
  loading,
  onPress,
}: {
  label: string;
  tone: 'outline' | 'light' | 'blue';
  loading?: boolean;
  onPress: () => void;
}) {
  const textColor = tone === 'light' ? colors.black : colors.white;
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const content = loading ? (
    <ActivityIndicator color={textColor} />
  ) : (
    <Text
      variant="button"
      color={textColor}
      style={tone === 'blue' ? styles.activateLabel : styles.passButtonLabel}
    >
      {label}
    </Text>
  );
  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.97, { duration: motion.fast });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: motion.fast });
      }}
      style={[
        styles.passButton,
        tone === 'light' && styles.passButtonLight,
        tone === 'outline' && styles.passButtonOutline,
        animatedStyle,
      ]}
    >
      {tone === 'blue' ? (
        <LinearGradient
          colors={[...ACTIVATE_GRADIENT]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.activateFill}
        >
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </AnimatedPressable>
  );
}

type MembershipSectionProps = {
  onBecomeMember: () => void;
  onViewHistory: () => void;
};

/** CUUB Pass card in the account sheet, with the way in (Activate) or around (History, Manage). */
export function MembershipSection({ onBecomeMember, onViewHistory }: MembershipSectionProps) {
  const billing = useBilling();
  const manage = useManageMembership();
  const [manageOpen, setManageOpen] = useState(false);
  const data = billing.data;
  const membership = data?.membership;
  const plan = data?.plan;
  const active = Boolean(membership?.active);

  const renewal = membership?.currentPeriodEnd
    ? new Date(membership.currentPeriodEnd).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;
  const card = active && membership ? cardLabel(membership.card) : null;
  const paymentFailed = membership?.status === 'past_due' || membership?.status === 'unpaid';
  const inactiveNote = membership && !active
    ? STATUS_COPY[membership.status] ?? (plan ? null : 'CUUB Pass is coming soon.')
    : null;

  return (
    <View style={styles.root}>
      <View style={styles.cardShell}>
        <LinearGradient colors={[...CARD_GRADIENT]} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.brand}>
              <Image source={passCube} style={styles.cube} />
              <Text style={styles.brandLabel}>CUUB Pass</Text>
            </View>
            {membership ? <StatusPill active={active} /> : null}
          </View>

          {active ? (
            <View style={styles.cardFooter}>
              <Text style={styles.footerText}>{card ?? ''}</Text>
              {renewal ? (
                <Text style={styles.footerText}>
                  {membership?.cancelAtPeriodEnd ? `Ends ${renewal}` : `Renews ${renewal}`}
                </Text>
              ) : null}
            </View>
          ) : inactiveNote ? (
            <Text muted style={styles.footerText}>
              {inactiveNote}
            </Text>
          ) : null}
        </LinearGradient>
      </View>

      {active ? (
        <View style={styles.buttonRow}>
          <PassButton label="View History" tone="outline" onPress={onViewHistory} />
          <PassButton label="Manage Pass" tone="outline" onPress={() => setManageOpen(true)} />
        </View>
      ) : paymentFailed ? (
        <View style={styles.buttonRow}>
          <PassButton label="View History" tone="outline" onPress={onViewHistory} />
          <PassButton
            label="Update card"
            tone="light"
            loading={manage.opening}
            onPress={() => void manage.open()}
          />
        </View>
      ) : plan ? (
        <View style={styles.buttonRow}>
          <PassButton label="Activate Unlimited Pass" tone="blue" onPress={onBecomeMember} />
        </View>
      ) : null}

      {active && membership ? (
        <ManagePassSheet
          visible={manageOpen}
          membership={membership}
          card={card}
          onClose={() => setManageOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing[3],
  },
  cardShell: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: OUTLINE,
    overflow: 'hidden',
  },
  card: {
    aspectRatio: 545 / 325,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  cube: {
    width: 21,
    height: 23,
    resizeMode: 'contain',
  },
  brandLabel: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  pill: {
    width: 76,
    height: 23,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    borderWidth: 1,
    borderColor: '#399AFE',
  },
  pillInactive: {
    backgroundColor: '#494949',
    borderWidth: 1,
    borderColor: '#5F5F5F',
  },
  pillLabel: {
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  footerText: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  passButton: {
    flex: 1,
    height: 60,
    borderRadius: radius.button + 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passButtonOutline: {
    backgroundColor: '#111111',
    borderWidth: 1.5,
    borderColor: OUTLINE,
  },
  passButtonLight: {
    backgroundColor: '#D9D9D9',
  },
  passButtonLabel: {
    fontWeight: '700',
  },
  activateFill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activateLabel: {
    fontWeight: '700',
  },
});
