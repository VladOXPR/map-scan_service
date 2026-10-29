import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Text, TextInput } from '@/components/ui';
import {
  authErrorMessage,
  normalizePhone,
  requestSmsCode,
} from '@/features/auth/api';
import { safeNext } from '@/features/auth/routes';
import { tracker } from '@/lib/analytics';
import { ApiError } from '@/lib/apiClient';
import { getPrivacyPolicyUrl, getTermsUrl } from '@/lib/config';
import { colors, spacing } from '@/theme';

const stationCover = require('../../assets/illustrations/StationCover.png');

const HERO_GRADIENT = ['#22B1F7', '#1F67E0'] as const;

const schema = z.object({
  phone: z
    .string()
    .min(7, 'Enter a valid phone number')
    .regex(/^[+\d\s()-]+$/, 'Enter a valid phone number'),
});

type FormValues = z.infer<typeof schema>;

export default function PhoneScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ entry?: string; next?: string }>();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '' },
  });

  const goToOtp = (phone: string) => {
    const next = safeNext(params.next);
    router.push({
      pathname: '/(auth)/otp',
      params: { phone, ...(next ? { next } : {}) },
    });
  };

  useEffect(() => {
    tracker.track('phone_viewed', { entry: typeof params.entry === 'string' ? params.entry : 'direct' });
    tracker.track('login_started');
  }, [params.entry]);

  const onSubmit = handleSubmit(async ({ phone }) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await requestSmsCode(phone);
      tracker.track('otp_requested', { resend: false });
      const nextPhone = result.phone || normalizePhone(phone);
      goToOtp(nextPhone);
    } catch (error) {
      tracker.track('otp_request_failed', {
        status: error instanceof ApiError ? error.status : 0,
        errorCode: error instanceof ApiError ? error.code : undefined,
      });
      setFormError(authErrorMessage(error, 'Couldn’t send a verification code'));
    } finally {
      setSubmitting(false);
    }
  });

  const onClose = () => {
    tracker.track('login_abandoned', { step: 'phone' });
    router.replace('/(app)');
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <LinearGradient
          colors={[...HERO_GRADIENT]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.heroGradient, { paddingTop: insets.top }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={[styles.closeButton, { top: insets.top + spacing[2] }]}
            hitSlop={8}
          >
            <Text style={styles.closeIcon}>×</Text>
          </Pressable>
          <Image
            source={stationCover}
            style={styles.heroImage}
            resizeMode="contain"
          />
        </LinearGradient>
      </View>

      <KeyboardAvoidingView
        style={styles.panel}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View
          style={[
            styles.panelInner,
            { paddingBottom: Math.max(insets.bottom, spacing[5]) },
          ]}
        >
          <Text style={styles.headline}>Whats your number 😉</Text>

          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                placeholder="312 555 0199"
                keyboardType="phone-pad"
                autoFocus
                textContentType="telephoneNumber"
                autoComplete="tel"
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                error={formState.errors.phone?.message}
              />
            )}
          />

          {formError ? (
            <Text variant="caption" color={colors.danger}>
              {formError}
            </Text>
          ) : null}

          <View style={styles.footer}>
            <Button
              label="Send code"
              variant="neutral"
              loading={submitting}
              onPress={onSubmit}
            />
            <Text variant="caption" muted style={styles.legal}>
              By continuing, you agree to our{' '}
              <Text
                variant="caption"
                color={colors.primary}
                onPress={() => {
                  tracker.track('terms_opened', { entry: 'phone' });
                  void Linking.openURL(getTermsUrl());
                }}
              >
                Terms
              </Text>
              {' '}and{' '}
              <Text
                variant="caption"
                color={colors.primary}
                onPress={() => {
                  tracker.track('privacy_opened', { entry: 'phone' });
                  void Linking.openURL(getPrivacyPolicyUrl());
                }}
              >
                Privacy Policy
              </Text>
              . We use your phone number to verify your account.
            </Text>
          </View>
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
  hero: {
    flex: 1,
  },
  heroGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    left: spacing[5],
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '400',
    marginTop: -1,
  },
  heroImage: {
    width: '72%',
    height: '78%',
  },
  panel: {
    flex: 2,
    backgroundColor: '#000000',
  },
  panelInner: {
    flex: 1,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[6],
    gap: spacing[4],
  },
  headline: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  legal: {
    lineHeight: 18,
  },
  footer: {
    marginTop: spacing[1],
    gap: spacing[4],
  },
});
