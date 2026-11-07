import { useRef } from 'react';
import { Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from './Text';
import { colors, radius } from '@/theme';

const ITEM_HEIGHT = 48;
/** Rows above and below the selected one. */
const SIDE_ROWS = 2;

type WheelPickerProps = {
  values: number[];
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
};

/** iOS-style roulette wheel: rows curve away from the centred selection, which snaps into place. */
export function WheelPicker({ values, value, onChange, accessibilityLabel }: WheelPickerProps) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const initialIndex = Math.max(0, values.indexOf(value));
  const scrollY = useSharedValue(initialIndex * ITEM_HEIGHT);
  const index = values.indexOf(value);
  const settledRef = useRef(initialIndex);
  const placedRef = useRef(false);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const select = (next: number) => {
    const clamped = Math.min(values.length - 1, Math.max(0, next));
    if (clamped === settledRef.current) return;
    settledRef.current = clamped;
    onChange(values[clamped]);
  };

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    select(Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT));
  };

  const scrollToIndex = (next: number) => {
    const clamped = Math.min(values.length - 1, Math.max(0, next));
    scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
    select(clamped);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: String(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') scrollToIndex(index + 1);
        if (event.nativeEvent.actionName === 'decrement') scrollToIndex(index - 1);
      }}
      style={styles.root}
    >
      <View pointerEvents="none" style={styles.band} />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: initialIndex * ITEM_HEIGHT }}
        onContentSizeChange={() => {
          // Android ignores `contentOffset`.
          if (placedRef.current) return;
          placedRef.current = true;
          scrollRef.current?.scrollTo({ y: initialIndex * ITEM_HEIGHT, animated: false });
        }}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * SIDE_ROWS }}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(event) => {
          if (!event.nativeEvent.velocity?.y) settle(event);
        }}
      >
        {values.map((item, i) => (
          <WheelRow key={item} label={String(item)} index={i} scrollY={scrollY} onPress={() => scrollToIndex(i)} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

function WheelRow({
  label,
  index,
  scrollY,
  onPress,
}: {
  label: string;
  index: number;
  scrollY: SharedValue<number>;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const offset = (index * ITEM_HEIGHT - scrollY.value) / ITEM_HEIGHT;
    const distance = Math.abs(offset);
    return {
      opacity: interpolate(distance, [0, 1, 2, 3], [1, 0.5, 0.25, 0], Extrapolation.CLAMP),
      transform: [
        { perspective: 600 },
        { rotateX: `${interpolate(offset, [-3, 0, 3], [60, 0, -60], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(distance, [0, 2], [1, 0.85], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Pressable onPress={onPress} accessible={false}>
      <Animated.View style={[styles.row, style]}>
        <Text style={styles.rowText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    height: ITEM_HEIGHT * (SIDE_ROWS * 2 + 1),
    justifyContent: 'center',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ITEM_HEIGHT * SIDE_ROWS,
    height: ITEM_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  row: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
  },
});
