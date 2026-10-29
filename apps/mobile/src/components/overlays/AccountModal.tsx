import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostHogMaskView } from 'posthog-react-native';
import { Button, Text } from '@/components/ui';
import { tracker } from '@/lib/analytics';
import {
  getPrivacyPolicyUrl,
  getSupportUrl,
  getTermsUrl,
} from '@/lib/config';
import { colors, radius, spacing } from '@/theme';

type AccountModalProps = {
  visible: boolean;
  phone: string;
  name?: string | null;
  signedIn?: boolean;
  profileComplete?: boolean;
  deleting?: boolean;
  /** Membership section, rendered under the account details when signed in. */
  membership?: ReactNode;
  onClose: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onCompleteProfile?: () => void;
};

export function AccountModal({
  visible,
  phone,
  name,
  signedIn = false,
  profileComplete = true,
  deleting = false,
  membership,
  onClose,
  onLogin,
  onLogout,
  onDeleteAccount,
  onCompleteProfile,
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

  const openUrl = (url: string, event: 'privacy_opened' | 'terms_opened' | 'support_sms_tapped') => {
    tracker.track(event, { entry: 'account' });
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
            {signedIn ? (
              <PostHogMaskView style={styles.details}>
                {name ? <Text style={styles.phone}>{name}</Text> : null}
                <Text muted style={styles.label}>
                  {name ? 'Phone number' : 'Your phone number'}
                </Text>
                <Text style={name ? styles.secondary : styles.phone}>{phone || '—'}</Text>
                {!profileComplete && onCompleteProfile ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={onCompleteProfile}
                    style={styles.profileRow}
                  >
                    <Text variant="subtitle">Complete your profile</Text>
                    <Text variant="caption" muted>
                      Add your name and date of birth to unlock power banks.
                    </Text>
                  </Pressable>
                ) : null}
              </PostHogMaskView>
            ) : (
              <>
                <Text muted style={styles.label}>
                  Account
                </Text>
                <Text style={styles.phone}>Log in with your number</Text>
              </>
            )}
            {signedIn && membership ? <View style={styles.membership}>{membership}</View> : null}
          </View>

          <View style={styles.actions}>
            <View style={styles.legalRow}>
              <Pressable onPress={() => openUrl(getPrivacyPolicyUrl(), 'privacy_opened')}>
                <Text variant="caption" muted>
                  Privacy Policy
                </Text>
              </Pressable>
              <Text variant="caption" muted>
                ·
              </Text>
              <Pressable onPress={() => openUrl(getTermsUrl(), 'terms_opened')}>
                <Text variant="caption" muted>
                  Terms
                </Text>
              </Pressable>
              <Text variant="caption" muted>
                ·
              </Text>
              <Pressable onPress={() => openUrl(getSupportUrl(), 'support_sms_tapped')}>
                <Text variant="caption" muted>
                  Support
                </Text>
              </Pressable>
            </View>
            {signedIn ? (
              <>
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
              </>
            ) : (
              <Button label="Log in" variant="neutral" onPress={onLogin} />
            )}
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
  secondary: {
    color: colors.white,
    fontSize: 17,
    lineHeight: 24,
  },
  details: {
    gap: spacing[2],
  },
  profileRow: {
    marginTop: spacing[4],
    padding: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing[1],
  },
  membership: {
    marginTop: spacing[5],
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
