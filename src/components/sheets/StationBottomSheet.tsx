import { forwardRef, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import BottomSheet, {
  BottomSheetView,
  useBottomSheetTimingConfigs,
} from '@gorhom/bottom-sheet';
import { Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton } from '@/components/ui/GradientButton';
import { Text } from '@/components/ui';
import { formatDistance, distanceMiles } from '@/lib/distance';
import type { Coordinates, Station } from '@/types/station';
import { colors, radius, spacing } from '@/theme';

const stationIcon = require('../../../assets/illustrations/Station.png');
const stationHeroStand = require('../../../assets/illustrations/Station_on_stand.png');
const stationHeroTall = require('../../../assets/illustrations/Tall.png');

type StationBottomSheetProps = {
  station: Station | null;
  userCoords: Coordinates | null;
  onClose: () => void;
  onPrimaryAction: (station: Station) => void;
  onChangeIndex?: (index: number) => void;
  onAnimate?: (fromIndex: number, toIndex: number) => void;
};

export const StationBottomSheet = forwardRef<BottomSheet, StationBottomSheetProps>(
  function StationBottomSheet(
    { station, userCoords, onClose, onPrimaryAction, onChangeIndex, onAnimate },
    ref,
  ) {
    const insets = useSafeAreaInsets();
    const snapPoints = useMemo(() => ['48%', '58%'], []);
    const animationConfigs = useBottomSheetTimingConfigs({
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });

    const distanceLabel = useMemo(() => {
      if (!station || !userCoords) return '—';
      const miles = distanceMiles(userCoords, {
        latitude: station.latitude,
        longitude: station.longitude,
      });
      if (miles < 0.1) return formatDistance(miles);
      return `${miles.toFixed(1)} mi`;
    }, [station, userCoords]);

    const hasLive = Boolean(station?.hasLiveData);

    const slotCount = useMemo(() => {
      if (!station) return 6;
      const filled = Math.max(0, station.batteriesAvailable);
      const open =
        station.openSlots != null ? Math.max(0, station.openSlots) : null;
      if (hasLive && open != null) {
        const sum = filled + open;
        if (sum > 0) return sum;
      }
      if (station.slotCapacity) return station.slotCapacity;
      return 6;
    }, [station, hasLive]);

    const powerbanks = hasLive ? (station?.batteriesAvailable ?? 0) : null;
    const slotsToReturn = hasLive
      ? (station?.openSlots ?? Math.max(0, slotCount - (powerbanks ?? 0)))
      : null;
    const heroImage = slotCount >= 24 ? stationHeroTall : stationHeroStand;

    const isUnavailable =
      station != null &&
      (station.online === false || station.locationInactive === true);

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        enablePanDownToClose
        enableDynamicSizing={false}
        snapPoints={snapPoints}
        animationConfigs={animationConfigs}
        animateOnMount={false}
        onClose={onClose}
        onChange={onChangeIndex}
        onAnimate={onAnimate}
        // No backdrop — map stays undimmed and interactive above the sheet.
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        style={styles.sheetContainer}
      >
        <BottomSheetView
          style={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, spacing[5]) },
          ]}
        >
          {station ? (
            <View style={styles.body}>
              <View style={styles.headerBlock}>
                <View style={styles.headerRow}>
                  <Text style={styles.walkTitle} numberOfLines={1}>
                    {station.name}
                  </Text>
                  {!isUnavailable ? (
                    <View style={styles.distancePill}>
                      <Image source={stationIcon} style={styles.pillIcon} />
                      <Text style={styles.distanceText}>{distanceLabel}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.headerDivider} />
              </View>

              <View style={styles.infoSection}>
                <View style={styles.infoCopy}>
                  <Text style={styles.stationType}>{slotCount} slot station</Text>

                  {hasLive ? (
                    <View style={styles.statRows}>
                      <View style={styles.statRow}>
                        <View style={[styles.statBadge, styles.statBadgeBlue]}>
                          <Text style={styles.statBadgeText}>{powerbanks}</Text>
                        </View>
                        <Text style={styles.statLabel}>Powerbanks</Text>
                      </View>

                      <View style={styles.statRow}>
                        <View style={[styles.statBadge, styles.statBadgeGrey]}>
                          <Text style={styles.statBadgeText}>
                            {slotsToReturn}
                          </Text>
                        </View>
                        <Text style={styles.statLabel}>Slots to return</Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                <Image
                  source={heroImage}
                  style={slotCount >= 24 ? styles.heroImageTall : styles.heroImage}
                />
              </View>

              <GradientButton
                label={isUnavailable ? 'Location Inactive' : 'Get Directions'}
                disabled={isUnavailable}
                onPress={() => onPrimaryAction(station)}
              />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text muted center>
                Select a station on the map
              </Text>
            </View>
          )}
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

const styles = StyleSheet.create({
  sheetContainer: {
    // Keep the sheet chrome on top without blocking map touches above it.
    zIndex: 30,
    elevation: 30,
  },
  sheet: {
    backgroundColor: '#111111',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  handle: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    width: 44,
  },
  content: {
    paddingHorizontal: spacing[5],
    flex: 1,
  },
  body: {
    gap: spacing[5],
    paddingTop: spacing[2],
  },
  headerBlock: {
    gap: spacing[4],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    gap: spacing[3],
  },
  walkTitle: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    flexShrink: 1,
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    backgroundColor: '#BBBBBB',
    borderWidth: 1,
    borderColor: '#DADADA',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  pillIcon: {
    width: 18,
    height: 22,
    resizeMode: 'contain',
  },
  distanceText: {
    color: '#000000',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '600',
  },
  headerDivider: {
    height: 2,
    backgroundColor: '#292929',
    marginHorizontal: -spacing[5],
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 160,
  },
  infoCopy: {
    flex: 1,
    gap: spacing[4],
    paddingRight: spacing[2],
  },
  stationType: {
    color: colors.white,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  statRows: {
    gap: spacing[3],
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  statBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBadgeBlue: {
    backgroundColor: '#0099FF',
  },
  statBadgeGrey: {
    backgroundColor: '#4C4C4C',
  },
  statBadgeText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '500',
  },
  heroImage: {
    width: 110,
    height: 180,
    resizeMode: 'contain',
  },
  heroImageTall: {
    width: 96,
    height: 200,
    resizeMode: 'contain',
  },
  empty: {
    paddingVertical: spacing[6],
  },
});
