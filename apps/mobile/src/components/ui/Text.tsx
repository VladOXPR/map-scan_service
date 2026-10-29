import { Text as RNText, type TextProps as RNTextProps, type StyleProp, type TextStyle } from 'react-native';
import { colors, typography } from '@/theme';

type Variant = keyof typeof typography;

export type AppTextProps = RNTextProps & {
  variant?: Variant;
  muted?: boolean;
  color?: string;
  center?: boolean;
  className?: string;
};

export function Text({
  variant = 'body',
  muted = false,
  color,
  center,
  style,
  children,
  ...rest
}: AppTextProps) {
  const base = typography[variant];
  const resolvedColor = color ?? (muted ? colors.muted : colors.text);

  return (
    <RNText
      {...rest}
      style={[
        {
          color: resolvedColor,
          fontSize: base.fontSize,
          lineHeight: base.lineHeight,
          fontWeight: base.fontWeight,
          textAlign: center ? 'center' : undefined,
        },
        style as StyleProp<TextStyle>,
      ]}
    >
      {children}
    </RNText>
  );
}
