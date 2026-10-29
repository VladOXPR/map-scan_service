import { useMemo, useRef } from 'react';
import {
  Pressable,
  TextInput as RNTextInput,
  StyleSheet,
  View,
  type TextInputKeyPressEventData,
  type NativeSyntheticEvent,
} from 'react-native';
import { Text } from './Text';
import { colors, radius, spacing } from '@/theme';

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  error?: string;
};

export function OtpInput({ value, onChange, length = 4, error }: OtpInputProps) {
  const inputRef = useRef<RNTextInput>(null);
  const cellSize = length >= 6 ? 48 : 64;
  const digits = useMemo(() => {
    const chars = value.replace(/\D/g, '').slice(0, length).split('');
    return Array.from({ length }, (_, i) => chars[i] ?? '');
  }, [length, value]);

  const handleChange = (text: string) => {
    onChange(text.replace(/\D/g, '').slice(0, length));
  };

  const handleKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    if (event.nativeEvent.key === 'Backspace' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={styles.row}
      >
        {digits.map((digit, index) => {
          const focused =
            value.length === index ||
            (value.length === length && index === length - 1);
          return (
            <View
              key={index}
              style={[
                styles.cell,
                {
                  width: cellSize,
                  height: cellSize,
                  borderColor: error
                    ? colors.danger
                    : focused
                      ? '#BBBBBB'
                      : colors.border,
                },
              ]}
            >
              <Text style={[styles.digit, length >= 6 && styles.digitCompact]}>
                {digit}
              </Text>
            </View>
          );
        })}
      </Pressable>

      <RNTextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onKeyPress={handleKeyPress}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={length}
        caretHidden
        style={styles.hiddenInput}
      />

      {error ? (
        <Text variant="caption" color={colors.danger} center>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing[4],
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'center',
  },
  cell: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  digitCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0.01,
    height: 1,
    width: 1,
  },
});
