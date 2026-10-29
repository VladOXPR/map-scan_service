import { View, type ViewProps } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          padding: spacing[5],
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
