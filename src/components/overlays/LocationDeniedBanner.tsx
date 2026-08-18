import { Linking, Pressable, View } from 'react-native';
import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

type LocationDeniedBannerProps = {
  visible: boolean;
};

export function LocationDeniedBanner({ visible }: LocationDeniedBannerProps) {
  if (!visible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: spacing[5],
        left: spacing[5],
        right: spacing[5],
        backgroundColor: 'rgba(28,28,30,0.94)',
        borderRadius: radius.xl,
        padding: spacing[4],
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing[2],
      }}
    >
      <Text variant="subtitle">Enable location for nearby stations</Text>
      <Text variant="caption" muted>
        You can still browse stations, but enabling location helps us show the
        closest cubes first.
      </Text>
      <Pressable onPress={() => Linking.openSettings()} hitSlop={8}>
        <Text variant="caption" color={colors.primary}>
          Open Settings
        </Text>
      </Pressable>
    </View>
  );
}
