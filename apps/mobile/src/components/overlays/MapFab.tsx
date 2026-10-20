import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { colors, motion, radius, spacing } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type MapFabProps = {
  label: string;
  onPress: () => void;
};

export function MapFab({ label, onPress }: MapFabProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.97, { duration: motion.fast });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: motion.fast });
      }}
      style={[
        animatedStyle,
        {
          backgroundColor: 'rgba(0,0,0,0.82)',
          borderRadius: radius.pill,
          paddingHorizontal: spacing[5],
          paddingVertical: spacing[3],
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        },
      ]}
    >
      <Text variant="subtitle">{label}</Text>
    </AnimatedPressable>
  );
}

type MapFabGroupProps = {
  onFindNearest: () => void;
  onSupport: () => void;
};

export function MapFabGroup({ onFindNearest, onSupport }: MapFabGroupProps) {
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: spacing[5],
        right: spacing[5],
        bottom: spacing[7],
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: spacing[3],
      }}
    >
      <MapFab label="Find nearest station" onPress={onFindNearest} />
      <MapFab label="Text Support" onPress={onSupport} />
    </View>
  );
}
