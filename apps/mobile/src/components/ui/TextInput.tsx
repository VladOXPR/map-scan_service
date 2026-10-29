import { forwardRef } from 'react';
import {
  TextInput as RNTextInput,
  View,
  type TextInputProps as RNTextInputProps,
} from 'react-native';
import { Text } from './Text';
import { colors, radius, spacing } from '@/theme';

export type AppTextInputProps = RNTextInputProps & {
  label?: string;
  error?: string;
};

export const TextInput = forwardRef<RNTextInput, AppTextInputProps>(
  function TextInput({ label, error, style, ...rest }, ref) {
    return (
      <View style={{ gap: spacing[2] }}>
        {label ? (
          <Text variant="caption" muted>
            {label}
          </Text>
        ) : null}
        <RNTextInput
          ref={ref}
          placeholderTextColor={colors.muted}
          selectionColor="#BBBBBB"
          style={[
            {
              minHeight: 56,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: error ? colors.danger : colors.border,
              backgroundColor: colors.surface,
              color: colors.text,
              paddingHorizontal: spacing[4],
              fontSize: 17,
            },
            style,
          ]}
          {...rest}
        />
        {error ? (
          <Text variant="caption" color={colors.danger}>
            {error}
          </Text>
        ) : null}
      </View>
    );
  },
);
