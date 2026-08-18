import { useEffect } from 'react';
import { Image, View } from 'react-native';
import { Redirect } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useAuthStore } from '@/store/authStore';
import { useLocationStore } from '@/store/locationStore';
import { motion } from '@/theme';

const splashLogo = require('../assets/branding/splash_icon.png');

export default function SplashGate() {
  const authHydrated = useAuthStore((s) => s.hydrated);
  const locationHydrated = useLocationStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: motion.slow });
    translateY.value = withDelay(
      80,
      withTiming(0, { duration: motion.slow }),
    );
  }, [opacity, translateY]);

  const brandStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!authHydrated || !locationHydrated) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#161616',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View style={brandStyle}>
          <Image
            source={splashLogo}
            style={{ width: 240, height: 71 }}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/phone" />;
  }

  return <Redirect href="/(app)" />;
}
