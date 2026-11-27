import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { colors, radius, spacing } from '@/theme';

/** Selectable pill: dark at rest, light grey when picked. */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text
        variant="caption"
        color={selected ? colors.black : colors.text}
        style={[styles.label, selected && styles.labelSelected]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: '#BBBBBB',
    borderColor: '#DADADA',
  },
  label: {
    fontWeight: '600',
  },
  labelSelected: {
    fontWeight: '700',
  },
});
