import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/ui';
import {
  getPrivacyPolicyUrl,
  getSupportUrl,
  getTermsUrl,
} from '@/lib/config';
import { colors, radius, spacing } from '@/theme';

type AccountModalProps = {
  visible: boolean;
  phone: string;
  deleting?: boolean;
  onClose: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
};

export function AccountModal({
  visible,
  phone,
  deleting = false,
  onClose,
  onLogout,
  onDeleteAccount,
}: AccountModalProps) {
  const insets = useSafeAreaInsets();

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your CUUB account and signed-in session. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: onDeleteAccount,
        },
      ],
    );
  };

  const openUrl = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              paddingTop: insets.top + spacing[2],
              paddingBottom: Math.max(insets.bottom, spacing[5]),
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close account"
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={8}
          >
            <Text style={styles.closeIcon}>×</Text>
          </Pressable>

          <View style={styles.content}>
            <Text muted style={styles.label}>
              Your phone number
            </Text>
            <Text style={styles.phone}>{phone || '—'}</Text>
          </View>

          <View style={styles.actions}>
            <View style={styles.legalRow}>
              <Pressable onPress={() => openUrl(getPrivacyPolicyUrl())}>
                <Text variant="caption" muted>
                  Privacy Policy
                </Text>
              </Pressable>
              <Text variant="caption" muted>
                ·
              </Text>
              <Pressable onPress={() => openUrl(getTermsUrl())}>
                <Text variant="caption" muted>
                  Terms
                </Text>
              </Pressable>
              <Text variant="caption" muted>
                ·
              </Text>
              <Pressable onPress={() => openUrl(getSupportUrl())}>
                <Text variant="caption" muted>
                  Support
                </Text>
              </Pressable>
            </View>
            <Button label="Log out" variant="neutral" onPress={onLogout} />
            <Pressable
              accessibilityRole="button"
              disabled={deleting}
              onPress={confirmDelete}
              style={[styles.deleteButton, deleting && styles.deleteDisabled]}
            >
              {deleting ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <Text variant="button" color="rgba(255,69,58,0.55)">
                  Delete account
                </Text>
              )}
            </Pressable>
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
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  sheet: {
    flex: 1,
    backgroundColor: '#111111',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing[5],
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[6],
  },
  closeIcon: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '400',
    marginTop: -1,
  },
  content: {
    flex: 1,
    gap: spacing[2],
  },
  label: {
    marginBottom: 2,
  },
  phone: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  actions: {
    gap: spacing[3],
  },
  deleteButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
  },
  deleteDisabled: {
    opacity: 0.45,
  },
});
