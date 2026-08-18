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
import { OtpInput, Text } from '@/components/ui';
import {
  OTP_LENGTH,
  OTP_RESEND_COOLDOWN_SEC,
  authErrorMessage,
  requestSmsCode,
  verifySmsCode,
} from '@/features/auth/api';
import { useLocationPermission } from '@/features/location/hooks';
import { ApiError } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { colors, spacing } from '@/theme';

export default function OtpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = useMemo(
    () => (Array.isArray(params.phone) ? params.phone[0] : params.phone) ?? '',
    [params.phone],
  );
  const setSession = useAuthStore((s) => s.setSession);
  const { prompted, requestPermission } = useLocationPermission();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(OTP_RESEND_COOLDOWN_SEC);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const onVerify = async (nextCode: string = code) => {
    if (verifyingRef.current) return;
    if (nextCode.length < OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code`);
      return;
    }
    if (!phone) {
      setError('Missing phone number. Go back and try again.');
      return;
    }

    verifyingRef.current = true;
    setLoading(true);
    setError(undefined);
    try {
      const session = await verifySmsCode(phone, nextCode);
      await setSession(session);
      // System location prompt once after account/sign-in — no dedicated screen.
      if (!prompted) {
        await requestPermission();
      }
      router.replace('/(app)');
    } catch (err) {
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

  const onResend = async () => {
    if (cooldown > 0 || resending || !phone) return;
    setResending(true);
    setError(undefined);
    try {
      await requestSmsCode(phone);
      setCode('');
      setCooldown(OTP_RESEND_COOLDOWN_SEC);
    } catch (err) {
      setError(authErrorMessage(err, 'Couldn’t resend code'));
      if (err instanceof ApiError && err.status === 429) {
        setCooldown(OTP_RESEND_COOLDOWN_SEC);
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.backBtn}
      >
        <Text style={styles.backLabel}>← Back</Text>
      </Pressable>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.center}>
          <OtpInput
            value={code}
            onChange={onChangeCode}
            length={OTP_LENGTH}
            error={error}
          />

          {loading ? (
            <ActivityIndicator color="#BBBBBB" style={styles.spinner} />
          ) : (
            <Pressable
              disabled={cooldown > 0 || resending}
              onPress={() => {
                void onResend();
              }}
              style={styles.resend}
            >
              <Text
                variant="subtitle"
                color={cooldown > 0 || resending ? '#666666' : '#BBBBBB'}
                center
              >
                {resending
                  ? 'Sending…'
                  : cooldown > 0
                    ? `Resend code in ${cooldown}s`
                    : 'Resend code'}
              </Text>
            </Pressable>
          )}
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
  backBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
  },
  backLabel: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '600',
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
  resend: {
    paddingVertical: spacing[2],
  },
  spinner: {
    marginTop: spacing[2],
  },
});
