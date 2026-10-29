import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/ui';
import type { WelcomeVariant } from '@/types/auth';
import { colors, motion, spacing } from '@/theme';

type WelcomeOverlayProps = {
  visible: boolean;
  variant: WelcomeVariant;
  onFinished: () => void;
};

const HOLD_MS = 3000;

const COPY: Record<WelcomeVariant, string> = {
  new: 'Welcome to CUUB',
  back: 'Welcome back',
};

/** Full-screen welcome that fades out after ~3s. */
export function WelcomeOverlay({
  visible,
  variant,
  onFinished,
}: WelcomeOverlayProps) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      opacity.value = 0;
      return;
    }

    opacity.value = withSequence(
      withTiming(1, { duration: motion.slow }),
      withDelay(
        HOLD_MS,
        withTiming(0, { duration: motion.slow }, (finished) => {
          if (finished) {
            runOnJS(onFinished)();
          }
        }),
      ),
    );
  }, [visible, onFinished, opacity, variant]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.root, style]}>
      <Text variant="display" center style={styles.title}>
        {COPY[variant]}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  title: {
    color: colors.white,
  },
});
