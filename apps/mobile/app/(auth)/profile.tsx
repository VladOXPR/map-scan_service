import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ageBracket } from '@cuub/core';
import { Button, Text, TextInput, WheelPicker } from '@/components/ui';
import { AuthHero } from '@/features/auth/AuthHero';
import { profileErrorMessage, updateProfile } from '@/features/auth/api';
import {
  afterAuthHref,
  membershipPath,
  safeNext,
  stationCodeIn,
  type ProfileTrigger,
} from '@/features/auth/routes';
import { fetchBilling } from '@/features/billing/api';
import { billingKey } from '@/features/billing/hooks';
import { tracker } from '@/lib/analytics';
import { ApiError } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { colors, spacing } from '@/theme';

const MIN_AGE = 13;
const MAX_AGE = 120;
const AGES = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => MIN_AGE + i);
/** Where the age wheel starts for someone who hasn't given one yet. */
const DEFAULT_AGE = 21;
const MAX_NAME_LENGTH = 100;

function isTrigger(value: unknown): value is ProfileTrigger {
  return value === 'signup' || value === 'unlock' || value === 'account';
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ trigger?: string; next?: string }>();
  const trigger: ProfileTrigger = isTrigger(params.trigger) ? params.trigger : 'signup';
  const next = safeNext(params.next);
  const session = useAuthStore((s) => s.session);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [step, setStep] = useState<'name' | 'age'>('name');
  const [name, setName] = useState(session?.user.name ?? '');
  const [age, setAge] = useState(
    session?.user.age != null && session.user.age >= MIN_AGE && session.user.age <= MAX_AGE
      ? session.user.age
      : DEFAULT_AGE,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tracker.track('profile_viewed', { trigger });
  }, [trigger]);

  useEffect(() => {
    if (!session) router.replace('/(app)');
  }, [router, session]);

  // A station would only send them straight back here.
  const leave = () => router.replace(afterAuthHref(trigger === 'unlock' || stationCodeIn(next) ? null : next));

  const validateName = (): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return 'Enter your name.';
    if (trimmed.length > MAX_NAME_LENGTH) return `Your name can be at most ${MAX_NAME_LENGTH} characters.`;
    return null;
  };

  const validate = (): string | null => {
    const nameProblem = validateName();
    if (nameProblem) return nameProblem;
    if (age < MIN_AGE) return `You must be at least ${MIN_AGE} to use CUUB.`;
    if (age > MAX_AGE) return 'Enter your age in years.';
    return null;
  };

  const onNameContinue = () => {
    const problem = validateName();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep('age');
  };

  /**
   * A finished sign-up goes straight to the membership paywall, unless they're a member already or none is on sale.
   * One that started at a station goes back to it, and the station opens payment.
   */
  const afterSignUpHref = async (token: string, userId: string): Promise<Href> => {
    if (next?.startsWith('/membership') || stationCodeIn(next)) return afterAuthHref(next);
    const billing = await queryClient
      .fetchQuery({ queryKey: billingKey(userId), queryFn: () => fetchBilling(token) })
      .catch(() => null);
    if (!billing?.plan || billing.membership.active) return afterAuthHref(next);
    return membershipPath({ trigger: 'signup' }) as Href;
  };

  const onSubmit = async () => {
    if (!session) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      tracker.track('profile_rejected', { reason: 'client_validation' });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const wasComplete = session.user.profileComplete;
      const user = await updateProfile(session.token, {
        name: name.trim().replace(/\s+/g, ' '),
        age,
      });
      await updateUser(user);
      tracker.track('profile_submitted', { ageBracket: ageBracket(user.age) ?? 'unknown' });
      router.replace(wasComplete ? afterAuthHref(next) : await afterSignUpHref(session.token, user.userId));
    } catch (err) {
      tracker.track('profile_rejected', {
        reason: err instanceof ApiError ? err.code ?? `http_${err.status}` : 'network',
      });
      setError(profileErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <AuthHero onClose={leave} />

      <KeyboardAvoidingView
        style={styles.panel}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, spacing[5]) },
          ]}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={step === 'name'}
        >
          {step === 'name' ? (
            <>
              <Text style={styles.headline}>Whats your name?</Text>
              <TextInput
                placeholder="Full name"
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  setError(null);
                }}
                autoFocus
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                maxLength={MAX_NAME_LENGTH}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={onNameContinue}
              />
            </>
          ) : (
            <>
              <Text style={styles.headline}>How old are you?</Text>
              <WheelPicker
                values={AGES}
                value={age}
                onChange={(value) => {
                  setAge(value);
                  setError(null);
                }}
                accessibilityLabel="Age"
              />
            </>
          )}

          {error ? (
            <Text variant="caption" color={colors.danger}>
              {error}
            </Text>
          ) : null}

          <Button
            label="Continue"
            variant="neutral"
            loading={submitting}
            onPress={() => {
              if (step === 'name') onNameContinue();
              else void onSubmit();
            }}
          />
          {step === 'age' ? (
            <Button
              label="Back"
              variant="ghost"
              disabled={submitting}
              onPress={() => {
                setError(null);
                setStep('name');
              }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  panel: {
    flex: 2,
    backgroundColor: '#000000',
  },
  content: {
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
});
