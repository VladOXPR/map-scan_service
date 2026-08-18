import { View } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { colors, spacing } from '@/theme';

type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing[6],
        gap: spacing[3],
        backgroundColor: colors.bg,
      }}
    >
      <Text variant="title" center>
        {title}
      </Text>
      {description ? (
        <Text muted center>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing[3], alignSelf: 'stretch' }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
