import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

type CreateAccountSheetProps = {
  visible: boolean;
  onCreateAccount: () => void;
  onNotNow: () => void;
};

/** Optional first-run prompt — map stays usable via Not now. */
export function CreateAccountSheet({
  visible,
  onCreateAccount,
  onNotNow,
}: CreateAccountSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onNotNow}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onNotNow} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, spacing[5]) },
          ]}
        >
          <Text variant="title" style={styles.title}>
            Create a CUUB account?
          </Text>
          <Text muted style={styles.body}>
            Sign in with your phone number to save your account for future
            features. You can keep exploring stations without an account.
          </Text>

          <View style={styles.actions}>
            <Button
              label="Create account"
              variant="neutral"
              fullWidth
              onPress={onCreateAccount}
            />
            <Button
              label="Not now"
              variant="ghost"
              fullWidth
              onPress={onNotNow}
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
