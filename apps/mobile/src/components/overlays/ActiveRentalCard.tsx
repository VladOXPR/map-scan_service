import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MembershipChip, Text } from '@/components/ui';
import type { AppRental } from '@/features/rentals/api';
import { tracker } from '@/lib/analytics';
import { colors, radius, rentTypeColors, spacing } from '@/theme';
import { nearestBarHeight } from './MapChrome';

/** Card height plus its gap; map controls lift by this much while it shows. */
export const ACTIVE_RENTAL_CARD_SPACE = 88 + spacing[3];

const SOON_MS = 30 * 60_000;
const tracked = new Set<string>();

function durationLabel(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** The person's open rental, pinned above the bottom bar on the map. */
export function ActiveRentalCard({ rental, onPress }: { rental: AppRental; onPress?: () => void }) {
  const insets = useSafeAreaInsets();
  const now = useNow(30_000);
  const subscription = rental.rentType === 'SUBSCRIPTION';
  const releasing = rental.status === 'PENDING_UNLOCK';

  useEffect(() => {
    if (tracked.has(rental.rentalId)) return;
    tracked.add(rental.rentalId);
    tracker.track('rental_card_viewed', { rentalId: rental.rentalId, rentType: rental.rentType });
  }, [rental.rentalId, rental.rentType]);

  const elapsed = now - new Date(rental.startedAt).getTime();
  const returnBy = rental.returnBy ? new Date(rental.returnBy) : null;
  const remaining = returnBy ? returnBy.getTime() - now : null;
  const returnLine = returnBy
    ? remaining !== null && remaining <= 0
      ? 'Return window ended'
      : `Return by ${returnBy.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : 'Return to any CUUB station';
  const returnColor =
    remaining !== null && remaining <= SOON_MS ? colors.danger : colors.muted;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: nearestBarHeight(insets.bottom) + spacing[3] }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={releasing ? 'Releasing your power bank' : `Power bank out for ${durationLabel(elapsed)}`}
        onPress={onPress}
        style={[styles.card, subscription && { borderColor: rentTypeColors.subscription }]}
      >
        <View
          style={[
            styles.accent,
            { backgroundColor: subscription ? rentTypeColors.subscription : rentTypeColors.payPerUse },
          ]}
        />
        <View style={styles.body}>
          <View style={styles.row}>
            <Text variant="subtitle">{releasing ? 'Releasing…' : 'Power bank out'}</Text>
            {subscription ? (
              <MembershipChip />
            ) : (
              <View style={styles.neutralChip}>
                <Text variant="caption" style={{ fontWeight: '700' }}>
                  Pay per use
                </Text>
              </View>
            )}
          </View>
          <View style={styles.row}>
            <Text variant="caption" muted>
              {releasing
                ? rental.startTitle ?? 'Take it from the station'
                : `Out ${durationLabel(elapsed)}${rental.startTitle ? ` · ${rental.startTitle}` : ''}`}
            </Text>
            {!releasing ? (
              <Text variant="caption" color={returnColor}>
                {returnLine}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing[5],
    right: spacing[5],
    zIndex: 21,
  },
  card: {
    height: 88,
    flexDirection: 'row',
    backgroundColor: '#161616',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  accent: {
    width: 5,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    gap: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  neutralChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: 3,
    backgroundColor: colors.elevated,
  },
});
