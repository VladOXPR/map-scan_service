import { ActivityIndicator, Pressable, type PressableProps, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from './Text';
import { colors, motion, radius } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'inverse' | 'ghost' | 'neutral';

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
};

const variantStyles: Record<
  Variant,
  { backgroundColor: string; textColor: string; borderColor?: string }
> = {
  primary: { backgroundColor: colors.primary, textColor: colors.white },
  secondary: { backgroundColor: colors.elevated, textColor: colors.white },
  inverse: { backgroundColor: colors.white, textColor: colors.black },
  ghost: {
    backgroundColor: 'transparent',
    textColor: colors.white,
    borderColor: colors.border,
  },
  neutral: {
    backgroundColor: '#BBBBBB',
    textColor: '#000000',
    borderColor: '#DADADA',
  },
};

export function Button({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = true,
  disabled,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: ButtonProps) {
  const scale = useSharedValue(1);
  const palette = variantStyles[variant];
  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPressIn={(e) => {
        scale.value = withTiming(0.97, { duration: motion.fast });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: motion.fast });
        onPressOut?.(e);
      }}
      style={[
        animatedStyle,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          borderWidth: palette.borderColor ? 1 : 0,
          borderRadius: radius.button,
          minHeight: 56,
          paddingHorizontal: 20,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isDisabled ? 0.45 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
      {...rest}
    >
      <View style={{ minHeight: 22, justifyContent: 'center', alignItems: 'center' }}>
        {loading ? (
          <ActivityIndicator color={palette.textColor} />
        ) : (
          <Text
            variant="button"
            color={palette.textColor}
            style={variant === 'neutral' ? { fontWeight: '700' } : undefined}
          >
            {label}
          </Text>
        )}
      </View>
    </AnimatedPressable>
  );
}
