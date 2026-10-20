import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from './Text';
import { colors, spacing } from '@/theme';

type HeaderProps = {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  right?: ReactNode;
};

export function Header({ title, subtitle, showBack = false, right }: HeaderProps) {
  const router = useRouter();

  return (
    <View
      style={{
        paddingHorizontal: spacing[5],
        paddingTop: spacing[2],
        paddingBottom: spacing[4],
        gap: spacing[2],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 36,
        }}
      >
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="subtitle">←</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
        {right ?? <View style={{ width: 40 }} />}
      </View>
      {title ? <Text variant="display">{title}</Text> : null}
      {subtitle ? (
        <Text variant="body" muted>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
