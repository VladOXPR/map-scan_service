import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, GradientButton, Text } from '@/components/ui';
import type { UnlockState } from '@/features/rentals/hooks';
import { colors, motion, spacing } from '@/theme';

const releaseImage = require('@cuub/assets/illustrations/Release.png');

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const BLUR_INTENSITY = 55;
const IMAGE_WIDTH = 210;
const IMAGE_HEIGHT = Math.round((IMAGE_WIDTH * 1236) / 962);
/** How long "Enjoy your charge" stays up before going back to the map. */
const HOME_AFTER_MS = 2600;

type Copy = { key: string; title: string; body: string | null };

function copyFor(state: UnlockState): Copy {
  switch (state.phase) {
    case 'released':
      return {
        key: 'released',
        title: 'Enjoy your charge',
        body: state.rental.slot != null ? `Grab it from slot ${state.rental.slot}.` : 'Grab it from the station.',
      };
    case 'slow':
      return {
        key: 'slow',
        title: 'Still releasing…',
        body: "The station is taking longer than usual. If nothing comes out, it's canceled automatically and you're not charged.",
      };
    case 'failed':
      return { key: 'failed', title: "Couldn't unlock", body: state.message };
    default:
      return { key: 'releasing', title: 'Power bank releasing…', body: null };
  }
}

type ScanReleaseOverlayProps = {
  state: UnlockState;
  /** False while POST /app/rentals is in flight: only the blur shows, under the scanner's spinning diamond. */
  showStatus: boolean;
  onRetry: () => void;
  onClose: () => void;
  onHome: () => void;
};

/** Blurs the frozen camera frame once a station QR is read, then tells the release story. */
export function ScanReleaseOverlay({ state, showStatus, onRetry, onClose, onHome }: ScanReleaseOverlayProps) {
  const insets = useSafeAreaInsets();
  const onHomeRef = useRef(onHome);
  onHomeRef.current = onHome;

  const blur = useSharedValue(0);
  const bob = useSharedValue(0);
  const pop = useSharedValue(1);
  const ripple = useSharedValue(0);

  useEffect(() => {
    blur.value = withTiming(BLUR_INTENSITY, { duration: motion.slow });
  }, [blur]);

  const bobbing = showStatus && state.phase === 'releasing';
  useEffect(() => {
    if (!bobbing) {
      cancelAnimation(bob);
      bob.value = withTiming(0, { duration: motion.fast });
      return;
    }
    const half = { duration: 700, easing: Easing.inOut(Easing.sin) };
    bob.value = withRepeat(withSequence(withTiming(-8, half), withTiming(0, half)), -1);
  }, [bob, bobbing]);

  const released = state.phase === 'released';
  useEffect(() => {
    if (!released) return;
    pop.value = withSequence(
      withTiming(1.1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 7, stiffness: 160 }),
    );
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
    const timer = setTimeout(() => onHomeRef.current(), HOME_AFTER_MS);
    return () => clearTimeout(timer);
  }, [pop, released, ripple]);

  const blurProps = useAnimatedProps(() => ({ intensity: blur.value }));
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }, { scale: pop.value }],
  }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ripple.value, [0, 0.05, 1], [0, 0.6, 0]),
    transform: [{ scale: interpolate(ripple.value, [0, 1], [0.55, 1.6]) }],
  }));

  const copy = copyFor(state);
  const actions =
    state.phase === 'slow' ? (
      <GradientButton label="Done" onPress={() => onHomeRef.current()} />
    ) : state.phase === 'failed' ? (
      <>
        <GradientButton label="Try again" onPress={onRetry} />
        <Button label="Close" variant="ghost" onPress={onClose} />
      </>
    ) : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <AnimatedBlurView tint="dark" animatedProps={blurProps} style={StyleSheet.absoluteFill} />
      {showStatus ? (
        <>
          <Animated.View
            pointerEvents="none"
            entering={FadeInDown.duration(motion.slow)}
            style={[styles.content, { paddingTop: insets.top + spacing[7] }]}
          >
            <Animated.View key={copy.key} entering={FadeIn.duration(motion.base)} style={styles.copy}>
              <Text center style={styles.headline}>
                {copy.title}
              </Text>
              {copy.body ? (
                <Text center muted>
                  {copy.body}
                </Text>
              ) : null}
            </Animated.View>
            <View style={styles.art}>
              <Animated.View style={[styles.ripple, rippleStyle]} />
              <Animated.Image source={releaseImage} resizeMode="contain" style={[styles.image, imageStyle]} />
            </View>
          </Animated.View>
          {actions ? (
            <Animated.View
              entering={FadeIn.duration(motion.base)}
              style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing[5]) }]}
            >
              {actions}
            </Animated.View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[7],
  },
  copy: {
    gap: spacing[2],
    alignItems: 'center',
  },
  headline: {
    color: colors.white,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  art: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    width: IMAGE_HEIGHT,
    height: IMAGE_HEIGHT,
    borderRadius: IMAGE_HEIGHT / 2,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  image: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing[5],
    gap: spacing[3],
  },
});
