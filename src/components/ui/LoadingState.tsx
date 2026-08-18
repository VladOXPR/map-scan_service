import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const TRACK_WIDTH = 120;
const BAR_WIDTH = 48;

type LoadingStateProps = {
  /** Kept for call-site compat; unused — loading UI is bar-only. */
  label?: string;
};

export function LoadingState(_props: LoadingStateProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: progress.value * (TRACK_WIDTH - BAR_WIDTH),
      },
    ],
  }));

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#161616',
      }}
    >
      <View
        style={{
          width: TRACK_WIDTH,
          height: 3,
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.16)',
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            {
              width: BAR_WIDTH,
              height: 3,
              borderRadius: 999,
              backgroundColor: '#FFFFFF',
            },
            barStyle,
          ]}
        />
      </View>
    </View>
  );
}
