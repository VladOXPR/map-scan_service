import { useState } from 'react';
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
import { useRouter } from 'expo-router';
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
import { getPrivacyPolicyUrl, getTermsUrl } from '@/lib/config';
import { colors, radius, spacing } from '@/theme';

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
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Set after a code is sent; survives router.back() from OTP so the user
  // can return without waiting out the resend cooldown.
  const [pendingOtpPhone, setPendingOtpPhone] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '' },
  });

  const goToOtp = (phone: string) => {
    router.push({
      pathname: '/(auth)/otp',
      params: { phone },
    });
  };

  const onSubmit = handleSubmit(async ({ phone }) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await requestSmsCode(phone);
      const nextPhone = result.phone || normalizePhone(phone);
      setPendingOtpPhone(nextPhone);
      goToOtp(nextPhone);
    } catch (error) {
      setFormError(authErrorMessage(error, 'Couldn’t send a verification code'));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <LinearGradient
          colors={[...HERO_GRADIENT]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.heroGradient, { paddingTop: insets.top }]}
        >
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
            <View style={styles.actions}>
              <Button
                label="Send code"
                variant="neutral"
                loading={submitting}
                onPress={onSubmit}
                fullWidth={false}
                style={styles.sendCodeBtn}
              />
              {pendingOtpPhone ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Return to verification code"
                  disabled={submitting}
                  onPress={() => goToOtp(pendingOtpPhone)}
                  style={({ pressed }) => [
                    styles.returnBtn,
                    (pressed || submitting) && styles.returnBtnPressed,
                  ]}
                >
                  <Text style={styles.returnArrow}>→</Text>
                </Pressable>
              ) : null}
            </View>
            <Text variant="caption" muted style={styles.legal}>
              By continuing, you agree to our{' '}
              <Text
                variant="caption"
                color={colors.primary}
                onPress={() => {
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  sendCodeBtn: {
    flex: 1,
    alignSelf: 'auto',
  },
  returnBtn: {
    width: 56,
    height: 56,
    flexShrink: 0,
    borderRadius: radius.button,
    backgroundColor: '#BBBBBB',
    borderWidth: 1,
    borderColor: '#DADADA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnBtnPressed: {
    opacity: 0.45,
  },
  returnArrow: {
    color: '#000000',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
    marginTop: -1,
  },
});
