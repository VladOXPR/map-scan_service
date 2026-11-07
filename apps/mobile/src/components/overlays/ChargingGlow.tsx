import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const FADE_MS = 600;

/** Soft blue glow around the screen edges while the phone is on power. */
export function ChargingGlow({ visible }: { visible: boolean }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: FADE_MS });
  }, [opacity, visible]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View pointerEvents="none" style={[styles.glow, animatedStyle]} />;
}

const styles = StyleSheet.create({
  glow: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
    boxShadow: 'inset 0 0 36px 4px rgba(56, 144, 240, 0.6)',
  },
});
