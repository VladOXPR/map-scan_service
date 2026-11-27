import { forwardRef } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import BottomSheet, {
  BottomSheetView,
  useBottomSheetTimingConfigs,
} from '@gorhom/bottom-sheet';
import { Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/ui';
import { walkingLabel } from '@/features/map/walking';
import type { AppRental } from '@/features/rentals/api';
import { ReturnByLine } from '@/features/rentals/ReturnByLine';
import { useRentalClock } from '@/features/rentals/useRentalClock';
import { formatDistance } from '@/lib/distance';
import type { Station } from '@/types/station';
import { colors, radius, spacing } from '@/theme';

const batteryIllu = require('@cuub/assets/illustrations/BatteryIllu.png');
const walkIcon = require('@cuub/assets/map/walk.png');

export type ReturnOption = {
  station: Station;
  /** Null without a location fix. */
  miles: number | null;
  walkMinutes: number | null;
};

type ReturnBottomSheetProps = {
  rental: AppRental | null;
  options: ReturnOption[];
  selectedId: string | null;
  onSelect: (station: Station) => void;
  onDirections: (station: Station) => void;
  onChangeIndex?: (index: number) => void;
  onAnimate?: (fromIndex: number, toIndex: number) => void;
};

function milesLabel(miles: number): string {
  return miles < 0.1 ? formatDistance(miles) : `${miles.toFixed(1)} mi`;
}

/** While a power bank is out: rental time, the two nearest open return slots, and directions. */
export const ReturnBottomSheet = forwardRef<BottomSheet, ReturnBottomSheetProps>(
  function ReturnBottomSheet(
    { rental, options, selectedId, onSelect, onDirections, onChangeIndex, onAnimate },
    ref,
  ) {
    const insets = useSafeAreaInsets();
    const animationConfigs = useBottomSheetTimingConfigs({
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    const clock = useRentalClock(rental?.startedAt);
    const selected = options.find((o) => o.station.id === selectedId) ?? options[0] ?? null;

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        enablePanDownToClose
        enableDynamicSizing
        animationConfigs={animationConfigs}
        animateOnMount={false}
        onChange={onChangeIndex}
        onAnimate={onAnimate}
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        style={styles.sheetContainer}
      >
        <BottomSheetView
          style={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing[5]) }]}
        >
          <View style={styles.body}>
            <View style={styles.headerBlock}>
              <View style={styles.headerRow}>
                <Text style={styles.title} numberOfLines={1}>
                  Battery in use
                </Text>
                <View style={styles.clockPill} accessibilityLabel={`Rental time ${clock}`}>
                  <Image source={batteryIllu} style={styles.pillIcon} />
                  <Text style={styles.clockText}>{clock}</Text>
                </View>
              </View>
              <View style={styles.headerDivider} />
            </View>

            {rental?.returnBy ? (
              <ReturnByLine startedAt={rental.startedAt} returnBy={rental.returnBy} />
            ) : null}

            <View style={styles.infoSection}>
              <View style={styles.infoCopy}>
                <Text style={styles.sectionTitle}>Return nearby</Text>
                {options.length ? (
                  <View style={styles.options}>
                    {options.map((option) => {
                      const active = option.station.id === selected?.station.id;
                      return (
                        <Pressable
                          key={option.station.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => onSelect(option.station)}
                          style={[styles.option, active && styles.optionActive]}
                        >
                          <Text style={styles.optionName} numberOfLines={1}>
                            {option.station.name}
                          </Text>
                          <View style={styles.optionMeta}>
                            {option.walkMinutes != null ? (
                              <>
                                <Image source={walkIcon} style={styles.walkIcon} />
                                <Text style={styles.walkText}>{walkingLabel(option.walkMinutes)}</Text>
                              </>
                            ) : null}
                            <Text style={styles.metaMuted} numberOfLines={1}>
                              {[
                                option.miles != null ? milesLabel(option.miles) : null,
                                `${option.station.openSlots ?? 0} open`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text muted style={styles.emptyCopy}>
                    No open return slots nearby right now.
                  </Text>
                )}
              </View>

              <Image source={batteryIllu} style={styles.heroImage} />
            </View>

            <Button
              label="Directions"
              variant="neutral"
              disabled={!selected}
              onPress={() => {
                if (selected) onDirections(selected.station);
              }}
              style={styles.directions}
              labelStyle={styles.directionsLabel}
            />
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

const styles = StyleSheet.create({
  sheetContainer: {
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
    gap: spacing[3],
  },
  title: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    flexShrink: 1,
  },
  clockPill: {
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
    width: 12,
    height: 22,
    resizeMode: 'contain',
  },
  clockText: {
    color: '#000000',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
    gap: spacing[3],
  },
  sectionTitle: {
    color: colors.white,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  options: {
    gap: spacing[2],
  },
  option: {
    backgroundColor: '#1C1C1C',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2A2A2A',
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    gap: 4,
  },
  optionActive: {
    borderColor: '#0099FF',
    backgroundColor: '#0E2233',
  },
  optionName: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  optionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  walkIcon: {
    width: 14,
    height: 14,
    tintColor: colors.white,
  },
  walkText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    marginRight: 2,
  },
  metaMuted: {
    color: '#9A9A9A',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    flexShrink: 1,
  },
  emptyCopy: {
    fontSize: 15,
    lineHeight: 20,
  },
  heroImage: {
    width: 96,
    height: 184,
    resizeMode: 'contain',
  },
  directions: {
    minHeight: 60,
    borderRadius: radius.button + 4,
  },
  directionsLabel: {
    fontWeight: '800',
  },
});
