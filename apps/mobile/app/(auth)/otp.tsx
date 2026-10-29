import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostHogMaskView } from 'posthog-react-native';
import { OtpInput, Text } from '@/components/ui';
import {
  OTP_LENGTH,
  authErrorMessage,
  shouldShowNewUserWelcome,
  verifySmsCode,
} from '@/features/auth/api';
import { afterAuthHref, phoneHref, profileHref, safeNext } from '@/features/auth/routes';
import { tracker } from '@/lib/analytics';
import { ApiError } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useWelcomeStore } from '@/store/welcomeStore';
import { spacing } from '@/theme';

const DIDNT_GET_CODE_DELAY_SEC = 10;

export default function OtpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ phone?: string; next?: string }>();
  const phone = useMemo(
    () => (Array.isArray(params.phone) ? params.phone[0] : params.phone) ?? '',
    [params.phone],
  );
  const next = safeNext(params.next);
  const setSession = useAuthStore((s) => s.setSession);
  const armWelcome = useWelcomeStore((s) => s.arm);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [showDidntGetCode, setShowDidntGetCode] = useState(false);
  const verifyingRef = useRef(false);

  useEffect(() => {
    const id = setTimeout(
      () => setShowDidntGetCode(true),
      DIDNT_GET_CODE_DELAY_SEC * 1000,
    );
    return () => clearTimeout(id);
  }, []);

  const onVerify = async (nextCode: string = code) => {
    if (verifyingRef.current) return;
    if (nextCode.length < OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code`);
      return;
    }
    if (!phone) {
      setError('Missing phone number. Try again.');
      return;
    }

    verifyingRef.current = true;
    setLoading(true);
    setError(undefined);
    try {
      const result = await verifySmsCode(phone, nextCode);
      tracker.track('otp_verified', { isNewUser: result.isNewUser });
      await setSession({ token: result.token, user: result.user });
      // New signup / re-register after delete → "Welcome to CUUB".
      // Existing returning account → "Welcome back".
      const showNew = await shouldShowNewUserWelcome(phone, result.isNewUser);
      armWelcome(showNew ? 'new' : 'back');
      // Existing phone-only accounts see the profile step here too.
      router.replace(
        result.user.profileComplete
          ? afterAuthHref(next)
          : profileHref({ trigger: 'signup', next }),
      );
    } catch (err) {
      tracker.track('otp_failed', {
        reason: err instanceof ApiError ? err.code ?? `http_${err.status}` : 'network',
      });
      setError(authErrorMessage(err, 'Verification failed'));
      setCode('');
      if (
        err instanceof ApiError &&
        err.status === 400 &&
        /no pending verification/i.test(err.message)
      ) {
        setTimeout(() => {
          router.replace('/(auth)/phone');
        }, 1200);
      }
    } finally {
      setLoading(false);
      verifyingRef.current = false;
    }
  };

  const onChangeCode = (value: string) => {
    if (loading) return;
    setCode(value);
    setError(undefined);
    if (value.length === OTP_LENGTH) {
      void onVerify(value);
    }
  };

  const onSendAnother = () => {
    router.replace(phoneHref({ entry: 'resend', next }));
  };

  const onClose = () => {
    tracker.track('login_abandoned', { step: 'otp' });
    router.replace('/(app)');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={[styles.closeButton, { top: insets.top + spacing[2] }]}
        hitSlop={8}
      >
        <Text style={styles.closeIcon}>×</Text>
      </Pressable>
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.center}>
          <PostHogMaskView>
            <OtpInput
              value={code}
              onChange={onChangeCode}
              length={OTP_LENGTH}
              error={error}
            />
          </PostHogMaskView>

          {loading ? (
            <ActivityIndicator color="#BBBBBB" style={styles.spinner} />
          ) : showDidntGetCode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send another verification code"
              onPress={onSendAnother}
              style={styles.didntGetCode}
            >
              <Text variant="subtitle" color="#BBBBBB" center>
                Didn&apos;t get code? Send another one
              </Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  closeButton: {
    position: 'absolute',
    left: spacing[5],
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '400',
    marginTop: -1,
  },
  body: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[6],
    marginBottom: spacing[9],
  },
  didntGetCode: {
    paddingVertical: spacing[2],
  },
  spinner: {
    marginTop: spacing[2],
  },
});
