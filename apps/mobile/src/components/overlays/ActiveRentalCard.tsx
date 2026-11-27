import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BatteryIcon, Text } from '@/components/ui';
import type { AppRental } from '@/features/rentals/api';
import type { PhoneBattery } from '@/features/rentals/usePhoneBattery';
import { tracker } from '@/lib/analytics';
import { colors, radius, spacing } from '@/theme';

const BANNER_HEIGHT = 46;

/** Banner height plus its gap; the Profile / Support row drops by this much while it shows. */
export const RENTAL_BANNER_SPACE = BANNER_HEIGHT + spacing[3];

const tracked = new Set<string>();

function durationLabel(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Stopwatch time: 4:05, then 1:04:05 past the hour. */
function counterLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

type ActiveRentalCardProps = {
  rental: AppRental;
  battery: PhoneBattery;
  /** Opens return-alert settings; the banner isn't pressable without it. */
  onPress?: () => void;
};

/** The person's open rental, pinned at the very top of the map. */
export function ActiveRentalCard({ rental, battery, onPress }: ActiveRentalCardProps) {
  const insets = useSafeAreaInsets();
  const now = useNow(1_000);
  const releasing = rental.status === 'PENDING_UNLOCK';

  useEffect(() => {
    if (tracked.has(rental.rentalId)) return;
    tracked.add(rental.rentalId);
    tracker.track('rental_card_viewed', { rentalId: rental.rentalId, rentType: rental.rentType });
  }, [rental.rentalId, rental.rentType]);

  const elapsed = now - new Date(rental.startedAt).getTime();
  const batteryLabel =
    battery.level == null
      ? ''
      : `. Phone battery ${Math.round(battery.level * 100)}%${battery.pluggedIn ? ', charging' : ''}`;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing[2] }]}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`${releasing ? 'Releasing your power bank' : `Power bank out for ${durationLabel(elapsed)}`}${batteryLabel}`}
        accessibilityHint={onPress ? 'Manage return alerts' : undefined}
        disabled={!onPress}
        onPress={onPress}
        style={styles.banner}
      >
        <BatteryIcon level={battery.level} />
        <Text variant="subtitle" style={styles.duration}>
          {releasing ? 'Releasing…' : counterLabel(elapsed)}
        </Text>
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
  banner: {
    height: BANNER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    backgroundColor: '#161616',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  duration: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
