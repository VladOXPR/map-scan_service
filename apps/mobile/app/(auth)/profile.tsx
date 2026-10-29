import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostHogMaskView } from 'posthog-react-native';
import { ageBracket } from '@cuub/core';
import { Button, Text, TextInput } from '@/components/ui';
import { profileErrorMessage, updateProfile } from '@/features/auth/api';
import { afterAuthHref, safeNext, type ProfileTrigger } from '@/features/auth/routes';
import { tracker } from '@/lib/analytics';
import { ApiError } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, spacing } from '@/theme';

const MIN_AGE = 13;
const MAX_NAME_LENGTH = 50;

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromIsoDate(value: string | null | undefined): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function isTrigger(value: unknown): value is ProfileTrigger {
  return value === 'signup' || value === 'unlock' || value === 'account';
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ trigger?: string; next?: string }>();
  const trigger: ProfileTrigger = isTrigger(params.trigger) ? params.trigger : 'signup';
  const next = safeNext(params.next);
  const session = useAuthStore((s) => s.session);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [firstName, setFirstName] = useState(session?.user.firstName ?? '');
  const [lastName, setLastName] = useState(session?.user.lastName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(
    fromIsoDate(session?.user.dateOfBirth),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const oldest = useMemo(() => new Date(today.getFullYear() - 120, 0, 1), [today]);
  const pickerStart = useMemo(
    () => dateOfBirth ?? new Date(today.getFullYear() - 25, 0, 1),
    [dateOfBirth, today],
  );

  useEffect(() => {
    tracker.track('profile_viewed', { trigger });
  }, [trigger]);

  useEffect(() => {
    if (!session) router.replace('/(app)');
  }, [router, session]);

  const leave = () => router.replace(afterAuthHref(trigger === 'unlock' ? null : next));

  const openPicker = () => {
    setError(null);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerStart,
        mode: 'date',
        maximumDate: today,
        minimumDate: oldest,
        onValueChange: (_event, date) => setDateOfBirth(date),
      });
      return;
    }
    if (!dateOfBirth) setDateOfBirth(pickerStart);
    setPickerOpen((open) => !open);
  };

  const validate = (): string | null => {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) return 'Enter your first and last name.';
    if (first.length > MAX_NAME_LENGTH || last.length > MAX_NAME_LENGTH) {
      return `Names can be at most ${MAX_NAME_LENGTH} characters.`;
    }
    if (!dateOfBirth) return 'Add your date of birth.';
    if (!ageBracket(toIsoDate(dateOfBirth))) return `You must be at least ${MIN_AGE} to use CUUB.`;
    return null;
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
      const iso = toIsoDate(dateOfBirth as Date);
      const user = await updateProfile(session.token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: iso,
      });
      await updateUser(user);
      tracker.track('profile_submitted', { ageBracket: ageBracket(iso) ?? 'unknown' });
      router.replace(afterAuthHref(next));
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
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={leave}
        style={[styles.closeButton, { top: insets.top + spacing[2] }]}
        hitSlop={8}
      >
        <Text style={styles.closeIcon}>×</Text>
      </Pressable>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, spacing[5]) },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.headline}>
              {trigger === 'unlock' ? 'One last step' : 'Tell us about you'}
            </Text>
            <Text muted>
              {trigger === 'unlock'
                ? 'Add your name and date of birth to unlock a power bank.'
                : 'We need your name and date of birth to set up your account.'}
            </Text>
          </View>

          <TextInput
            label="First name"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            maxLength={MAX_NAME_LENGTH}
            returnKeyType="next"
          />
          <TextInput
            label="Last name"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
            maxLength={MAX_NAME_LENGTH}
          />

          <View style={{ gap: spacing[2] }}>
            <Text variant="caption" muted>
              Date of birth
            </Text>
            <PostHogMaskView>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose your date of birth"
                onPress={openPicker}
                style={styles.dateField}
              >
                <Text color={dateOfBirth ? colors.text : colors.muted} style={styles.dateText}>
                  {dateOfBirth ? formatDate(dateOfBirth) : 'Select date'}
                </Text>
              </Pressable>
              {pickerOpen && Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={pickerStart}
                  mode="date"
                  display="spinner"
                  themeVariant="dark"
                  maximumDate={today}
                  minimumDate={oldest}
                  onValueChange={(_event, date) => setDateOfBirth(date)}
                />
              ) : null}
            </PostHogMaskView>
            <Text variant="caption" muted>
              You must be at least {MIN_AGE}. We never show your birthday to anyone.
            </Text>
          </View>

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
              void onSubmit();
            }}
          />
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
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[9] + spacing[5],
    gap: spacing[4],
  },
  header: {
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  headline: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  dateField: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 17,
  },
});
