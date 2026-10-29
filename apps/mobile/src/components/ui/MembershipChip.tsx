import { View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './Text';
import { colors, radius, rentTypeColors, spacing } from '@/theme';

/** Membership (subscription) rentals and members are blue on every surface. */
export function MembershipChip({
  label = 'Membership',
  style,
}: {
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ alignSelf: 'flex-start', borderRadius: radius.pill, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={[...rentTypeColors.subscriptionGradient]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ paddingHorizontal: spacing[3], paddingVertical: 3 }}
      >
        <Text variant="caption" color={colors.white} style={{ fontWeight: '700' }}>
          {label}
        </Text>
      </LinearGradient>
    </View>
  );
}
