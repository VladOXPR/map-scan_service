import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

type LocationPermissionSheetProps = {
  visible: boolean;
  loading?: boolean;
  onContinue: () => void;
};

export function LocationPermissionSheet({
  visible,
  loading = false,
  onContinue,
}: LocationPermissionSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => {
        if (!loading) onContinue();
      }}
    >
      <View style={styles.root}>
        <View style={styles.backdrop} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, spacing[5]) },
          ]}
        >
          <Text variant="title" style={styles.title}>
            Share your location
          </Text>
          <Text muted style={styles.body}>
            CUUB uses your location to show nearby battery stations and center
            the map on you.
          </Text>

          <View style={styles.actions}>
            <Button
              label="Continue"
              variant="inverse"
              fullWidth
              loading={loading}
              onPress={onContinue}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: '#161616',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    gap: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: {
    marginBottom: spacing[1],
  },
  body: {
    lineHeight: 20,
    marginBottom: spacing[2],
  },
  actions: {
    gap: spacing[2],
  },
});
