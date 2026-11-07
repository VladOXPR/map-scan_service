import { useRef } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { QrTapIcon, Text } from '@/components/ui';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, motion, radius, spacing } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const stationIcon = require('@cuub/assets/illustrations/Station.png');
const locationArrowIcon = require('@cuub/assets/map/location-arrow.png');
const locationArrowUnsharedIcon = require('@cuub/assets/map/location-arrow-unshared.png');

const PROFILE_SIZE = 44;
const SUPPORT_WIDTH = 98;
/** The QR tile inside the Unlock powerbank button. */
const UNLOCK_TILE = 32;

/** A square on screen, in window coordinates; the scanner page grows out of the unlock button's QR tile. */
export type TileFrame = { x: number; y: number; size: number };

/** The scanner's `tile` route param: "x,y,size". */
export function tileParam(tile: TileFrame): string {
  return `${tile.x},${tile.y},${tile.size}`;
}

export function parseTileParam(value: unknown): TileFrame | null {
  if (typeof value !== 'string') return null;
  const [x, y, size] = value.split(',').map(Number);
  if (![x, y, size].every(Number.isFinite) || size <= 0) return null;
  return { x, y, size };
}

/** Height of the nearest-location bar above the screen bottom (padding + button). */
export function nearestBarHeight(bottomInset: number) {
  const barBottomPad = Math.max(bottomInset, spacing[4]);
  const button = 56 + 4;
  return spacing[4] + button + barBottomPad;
}

function locateBottom(bottomInset: number) {
  return nearestBarHeight(bottomInset) + spacing[3];
}

export function ProfileButton({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.profileWrap, { top: insets.top + spacing[2] }]}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel="Account"
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(0.96, { duration: motion.fast });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: motion.fast });
        }}
        style={[styles.profileButton, animatedStyle]}
      >
        <View style={styles.avatarHead} />
        <View style={styles.avatarBody} />
      </AnimatedPressable>
    </View>
  );
}

type EnableLocationButtonProps = {
  onPress: () => void;
  locationShared?: boolean;
};

/** Blue locate control — above Nearest location. Icon reflects share state. */
export function EnableLocationButton({
  onPress,
  locationShared = false,
}: EnableLocationButtonProps) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.locationWrap,
        {
          right: spacing[5],
          bottom: locateBottom(insets.bottom),
        },
      ]}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={
          locationShared ? 'Center on my location' : 'Enable location'
        }
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(0.96, { duration: motion.fast });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: motion.fast });
        }}
        style={[styles.locationButton, animatedStyle]}
      >
        <Image
          source={
            locationShared ? locationArrowIcon : locationArrowUnsharedIcon
          }
          style={
            locationShared ? styles.locateArrow : styles.locateArrowUnshared
          }
        />
      </AnimatedPressable>
    </View>
  );
}

/** Beside the account button. */
export function SupportButton({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.supportWrap, { top: insets.top + spacing[2] }]}
    >
      <AnimatedPressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(0.97, { duration: motion.fast });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: motion.fast });
        }}
        style={[styles.supportButton, animatedStyle]}
      >
        <Text variant="subtitle">Support</Text>
      </AnimatedPressable>
    </View>
  );
}

type FindChargerBarProps = {
  onPress: () => void;
  label?: string;
  distanceLabel?: string | null;
};

export function FindChargerBar({ onPress, label = 'Nearest location', distanceLabel }: FindChargerBarProps) {
  const insets = useSafeAreaInsets();

  const swipeUp = Gesture.Pan()
    .activeOffsetY(-16)
    .failOffsetX([-48, 48])
    .onEnd((event) => {
      if (event.translationY < -20 || event.velocityY < -350) {
        runOnJS(onPress)();
      }
    });

  return (
    <GestureDetector gesture={swipeUp}>
      <View
        style={[
          styles.findBar,
          { paddingBottom: Math.max(insets.bottom, spacing[4]) },
        ]}
      >
        <GradientButton
          label={label}
          onPress={onPress}
          icon={
            distanceLabel ? (
              <View style={styles.distancePill}>
                <Image source={stationIcon} style={styles.pillIcon} />
                <Text style={styles.distanceText}>{distanceLabel}</Text>
              </View>
            ) : null
          }
        />
      </View>
    </GestureDetector>
  );
}

/** Bottom bar: scan a station to unlock, opening the scanner out of the button's QR tile. */
export function UnlockBar({ onPress }: { onPress: (tile: TileFrame | null) => void }) {
  const insets = useSafeAreaInsets();
  const tileRef = useRef<View>(null);

  const press = () => {
    const tile = tileRef.current;
    if (!tile) {
      onPress(null);
      return;
    }
    tile.measureInWindow((x, y, width) => onPress(width > 0 ? { x, y, size: width } : null));
  };

  return (
    <View style={[styles.findBar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
      <GradientButton
        label="Unlock powerbank"
        onPress={press}
        icon={
          <View ref={tileRef} collapsable={false}>
            <QrTapIcon size={UNLOCK_TILE} />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  profileWrap: {
    position: 'absolute',
    left: spacing[5],
    zIndex: 20,
  },
  locationWrap: {
    position: 'absolute',
    zIndex: 20,
  },
  locationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1F69E1',
    borderWidth: 1,
    borderColor: '#3884FF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileButton: {
    width: PROFILE_SIZE,
    height: PROFILE_SIZE,
    borderRadius: PROFILE_SIZE / 2,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
    marginBottom: 1,
  },
  avatarBody: {
    width: 14,
    height: 7,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    backgroundColor: colors.white,
  },
  locateArrow: {
    width: 19,
    height: 19,
    resizeMode: 'contain',
    tintColor: colors.white,
    marginTop: 1.5,
    marginLeft: -1.5,
  },
  locateArrowUnshared: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
    tintColor: colors.white,
  },
  supportWrap: {
    position: 'absolute',
    left: spacing[5] + PROFILE_SIZE + spacing[2],
    zIndex: 20,
  },
  supportButton: {
    width: SUPPORT_WIDTH,
    height: PROFILE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161616',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  findBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#161616',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing[4],
    paddingHorizontal: spacing[5],
    zIndex: 20,
  },
});
