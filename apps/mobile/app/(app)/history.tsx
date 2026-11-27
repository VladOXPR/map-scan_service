import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState, Header, LoadingState, Screen, Text } from '@/components/ui';
import { formatMoney } from '@/features/billing/api';
import type { AppRental, RentalStatus } from '@/features/rentals/api';
import { useRentalHistory } from '@/features/rentals/hooks';
import { colors, spacing } from '@/theme';

const STATUS_LABEL: Record<RentalStatus, string> = {
  PENDING_UNLOCK: 'Unlocking',
  ACTIVE: 'Out now',
  RETURNED: 'Returned',
  BOUGHT_OUT: 'Kept',
  UNLOCK_FAILED: 'Did not unlock',
};

function when(rental: AppRental): string {
  const started = new Date(rental.startedAt);
  const date = started.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

function duration(rental: AppRental): string | null {
  if (!rental.endedAt) return null;
  const minutes = Math.round(
    (new Date(rental.endedAt).getTime() - new Date(rental.startedAt).getTime()) / 60_000,
  );
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function RentalRow({ rental }: { rental: AppRental }) {
  const title = rental.startTitle ?? (rental.stationCode ? `Station ${rental.stationCode}` : 'CUUB station');
  const returnedElsewhere =
    rental.status === 'RETURNED' && rental.returnTitle && rental.returnTitle !== rental.startTitle
      ? `Returned at ${rental.returnTitle}`
      : null;
  const charged =
    rental.chargedCents && rental.chargedCents > 0
      ? formatMoney(rental.chargedCents, rental.currency ?? 'usd', { showCents: true })
      : null;
  const out = rental.status === 'ACTIVE' || rental.status === 'PENDING_UNLOCK';

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text variant="subtitle" numberOfLines={1} style={styles.rowTitle}>
          {title}
        </Text>
        <Text variant="caption" color={out ? colors.primary : colors.muted} style={styles.status}>
          {STATUS_LABEL[rental.status]}
        </Text>
      </View>
      <Text variant="caption" muted>
        {[when(rental), duration(rental), charged].filter(Boolean).join(' · ')}
      </Text>
      {returnedElsewhere ? (
        <Text variant="caption" muted numberOfLines={1}>
          {returnedElsewhere}
        </Text>
      ) : null}
    </View>
  );
}

export default function RentalHistoryScreen() {
  const history = useRentalHistory();

  return (
    <Screen>
      <Header showBack title="History" />
      {history.isLoading ? (
        <LoadingState />
      ) : history.isError ? (
        <EmptyState
          title="Could not load history"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void history.refetch()}
        />
      ) : !history.data?.length ? (
        <EmptyState title="No rentals yet" description="Your power bank rentals will show up here." />
      ) : (
        <FlatList
          data={history.data}
          keyExtractor={(rental) => rental.rentalId}
          renderItem={({ item }) => <RentalRow rental={item} />}
          contentContainerStyle={styles.list}
          refreshing={history.isRefetching}
          onRefresh={() => void history.refetch()}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[7],
    gap: spacing[3],
  },
  row: {
    padding: spacing[4],
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#333333',
    backgroundColor: '#161616',
    gap: spacing[1],
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  rowTitle: {
    flex: 1,
  },
  status: {
    fontWeight: '700',
  },
});
