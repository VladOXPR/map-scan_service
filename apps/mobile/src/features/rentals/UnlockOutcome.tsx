import { StyleSheet, View } from 'react-native';
import { MembershipChip, Text } from '@/components/ui';
import { formatMoney } from '@/features/billing/api';
import { colors, spacing } from '@/theme';
import type { UnlockState } from './hooks';

export function hoursLabel(hours: number): string {
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/** What the person reads once the cabinet released their power bank, or is slow to. */
export function UnlockOutcome({ state }: { state: UnlockState }) {
  if (state.phase === 'released') {
    const { rental } = state;
    return (
      <View style={styles.block}>
        <MembershipChip />
        <Text style={styles.headline}>Take your power bank</Text>
        <Text muted>
          {rental.slot != null
            ? `It's in slot ${rental.slot}, lit up on the station.`
            : 'It just popped out of the station.'}
        </Text>
        {rental.maxRentHours ? (
          <Text muted>
            {`Return it to any CUUB station within ${hoursLabel(rental.maxRentHours)}.`}
            {rental.buyoutCents != null
              ? ` After that, it's yours for ${formatMoney(rental.buyoutCents, rental.currency ?? 'usd')}.`
              : ''}
          </Text>
        ) : null}
      </View>
    );
  }
  if (state.phase === 'slow') {
    return (
      <View style={styles.block}>
        <Text style={styles.headline}>Still releasing…</Text>
        <Text muted>
          The station is taking longer than usual. Check the slots; your rental shows on the map once it's out.
          If nothing comes out, it's canceled automatically and you're not charged.
        </Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  block: {
    gap: spacing[2],
  },
  headline: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
});
