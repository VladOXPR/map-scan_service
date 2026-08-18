import { Image, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { colors, motion } from '@/theme';

const markerSource = require('../../../assets/map/station-marker.png');

type StationMarkerProps = {
  available: number;
  selected?: boolean;
  onPress?: () => void;
};

export function StationMarker({
  available,
  selected = false,
  onPress,
}: StationMarkerProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={() => {
        scale.value = withSequence(
          withTiming(1.12, { duration: motion.fast }),
          withTiming(1, { duration: motion.fast }),
        );
        onPress?.();
      }}
    >
      <Animated.View style={[{ alignItems: 'center' }, animatedStyle]}>
        <Image
          source={markerSource}
          style={{
            width: selected ? 52 : 44,
            height: selected ? 62 : 52,
            resizeMode: 'contain',
          }}
        />
        {available > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -4,
              minWidth: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 5,
              borderWidth: 2,
              borderColor: colors.bg,
            }}
          >
            <Text
              variant="caption"
              color={colors.white}
              style={{ fontWeight: '700', fontSize: 11, lineHeight: 14 }}
            >
              {available > 9 ? '9+' : available}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
