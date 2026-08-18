import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Station, Coordinates } from '@/types/station';
import { StationMarker } from './StationMarker';
import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export type CameraFitRequest = {
  token: number;
  from: Coordinates | null;
  to: Coordinates;
};

type StationMapProps = {
  stations: Station[];
  userCoords: Coordinates | null;
  selectedStationId?: string | null;
  onSelectStation: (station: Station) => void;
  onDeselect?: () => void;
  cameraTarget?: Coordinates | null;
  cameraZoom?: number;
  cameraFit?: CameraFitRequest | null;
};

/** Web preview: Mapbox native maps are unavailable in the browser. */
export function StationMap({
  stations,
  selectedStationId,
  onSelectStation,
}: StationMapProps) {
  return (
    <View style={styles.fill}>
      <View style={styles.hero}>
        <Text variant="title">CUUB map preview</Text>
        <Text muted style={{ marginTop: 6 }}>
          Native Mapbox renders on iOS/Android. On web, tap a station below.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {stations.map((station) => {
          const selected = station.id === selectedStationId;
          return (
            <Pressable
              key={station.id}
              onPress={() => onSelectStation(station)}
              style={[styles.card, selected && styles.cardSelected]}
            >
              <StationMarker
                available={station.batteriesAvailable}
                selected={selected}
                onPress={() => onSelectStation(station)}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="subtitle">{station.name}</Text>
                <Text variant="caption" muted numberOfLines={2}>
                  {station.address}
                </Text>
                <Text variant="caption" color={colors.primary}>
                  {station.batteriesAvailable} batteries · {station.status}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  hero: {
    paddingTop: spacing[8],
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  list: {
    padding: spacing[5],
    gap: spacing[3],
    paddingBottom: 140,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardSelected: {
    borderColor: colors.primary,
  },
});
