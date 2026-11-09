import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/ui';
import type { AppRental } from '@/features/rentals/api';
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_ISSUES,
  FEEDBACK_PURPOSES,
  LOW_RATING,
  type FeedbackAnswers,
  type FeedbackIssue,
  type FeedbackPurpose,
} from '@/features/rentals/feedback';
import { colors, radius, spacing } from '@/theme';

const STARS = [1, 2, 3, 4, 5] as const;
const STAR_ON = '#FFD60A';
const STAR_OFF = '#3A3A3C';
const THANKS_MS = 1_400;

type RentalFeedbackSheetProps = {
  rental: AppRental | null;
  visible: boolean;
  onSubmit: (answers: FeedbackAnswers) => Promise<void>;
  /** `dismissed` when closed without answering. */
  onClose: (dismissed: boolean) => void;
};

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function durationLabel(fromIso: string, toIso: string): string {
  const minutes = Math.max(1, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes} min` : `${hours} h ${minutes % 60} min`;
}

function placesLabel(rental: AppRental): string | null {
  const from = rental.startTitle;
  const to = rental.returnTitle;
  if (from && to) return from === to ? `At ${from}` : `${from} → ${to}`;
  return from ?? to;
}

function whenLabel(rental: AppRental): string {
  const date = new Date(rental.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (!rental.endedAt) return date;
  return `${date}, ${timeLabel(rental.startedAt)} – ${timeLabel(rental.endedAt)} · ${durationLabel(rental.startedAt, rental.endedAt)}`;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text
        variant="caption"
        color={selected ? colors.black : colors.text}
        style={[styles.chipLabel, selected && styles.chipLabelSelected]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Asked once a power bank is back: stars, then why they needed a charge, then what went wrong after a low rating. */
export function RentalFeedbackSheet({ rental, visible, onSubmit, onClose }: RentalFeedbackSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [rating, setRating] = useState(0);
  const [purpose, setPurpose] = useState<FeedbackPurpose | null>(null);
  const [issues, setIssues] = useState<FeedbackIssue[]>([]);
  const [comment, setComment] = useState('');
  const [phase, setPhase] = useState<'asking' | 'sending' | 'thanks'>('asking');
  const [error, setError] = useState<string | null>(null);

  const rentalId = rental?.rentalId;
  useEffect(() => {
    setRating(0);
    setPurpose(null);
    setIssues([]);
    setComment('');
    setPhase('asking');
    setError(null);
  }, [rentalId]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (phase !== 'thanks') return;
    const timer = setTimeout(() => onCloseRef.current(false), THANKS_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (!rental) return null;

  const low = rating > 0 && rating <= LOW_RATING;
  const places = placesLabel(rental);

  const dismiss = () => {
    if (phase === 'sending') return;
    onClose(phase !== 'thanks');
  };

  const toggleIssue = (issue: FeedbackIssue) =>
    setIssues((current) => (current.includes(issue) ? current.filter((i) => i !== issue) : [...current, issue]));

  const send = async () => {
    setPhase('sending');
    setError(null);
    try {
      await onSubmit({
        rating,
        purpose,
        issues: low ? issues : [],
        comment: low ? comment.trim() || null : null,
      });
      setPhase('thanks');
    } catch {
      setPhase('asking');
      setError("Couldn't send that. Check your connection and try again.");
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={dismiss}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={dismiss} />
        <View style={[styles.sheet, { maxHeight: height * 0.88, paddingBottom: Math.max(insets.bottom, spacing[5]) }]}>
          {phase === 'thanks' ? (
            <View style={styles.thanks}>
              <Text variant="title" center>
                Thanks for the feedback
              </Text>
              <Text muted center style={styles.body}>
                It helps us keep every station charged and ready.
              </Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} bounces={false}>
              <View style={styles.header}>
                <View style={styles.headerText}>
                  <Text variant="subtitle">Power bank returned</Text>
                  {places ? (
                    <Text muted variant="caption" numberOfLines={1}>
                      {places}
                    </Text>
                  ) : null}
                  <Text muted variant="caption">
                    {whenLabel(rental)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={12}
                  onPress={dismiss}
                  style={styles.close}
                >
                  <Text variant="subtitle" muted>
                    ✕
                  </Text>
                </Pressable>
              </View>

              <Text variant="title">How was your power bank?</Text>
              <View style={styles.stars} accessibilityRole="adjustable" accessibilityValue={{ min: 0, max: 5, now: rating }}>
                {STARS.map((star) => (
                  <Pressable
                    key={star}
                    accessibilityRole="button"
                    accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
                    hitSlop={6}
                    onPress={() => setRating(star)}
                  >
                    <Text style={[styles.star, { color: star <= rating ? STAR_ON : STAR_OFF }]}>★</Text>
                  </Pressable>
                ))}
              </View>

              {rating > 0 ? (
                <>
                  <Text variant="subtitle" style={styles.question}>
                    What did you need a charge for?
                  </Text>
                  <View style={styles.chips}>
                    {FEEDBACK_PURPOSES.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={purpose === option.value}
                        onPress={() => setPurpose(purpose === option.value ? null : option.value)}
                      />
                    ))}
                  </View>

                  {low ? (
                    <>
                      <Text variant="subtitle" style={styles.question}>
                        What could be better?
                      </Text>
                      <View style={styles.chips}>
                        {FEEDBACK_ISSUES.map((option) => (
                          <Chip
                            key={option.value}
                            label={option.label}
                            selected={issues.includes(option.value)}
                            onPress={() => toggleIssue(option.value)}
                          />
                        ))}
                      </View>
                      <TextInput
                        value={comment}
                        onChangeText={setComment}
                        placeholder="Tell us more (optional)"
                        placeholderTextColor={colors.muted}
                        selectionColor="#BBBBBB"
                        multiline
                        maxLength={FEEDBACK_COMMENT_MAX}
                        style={styles.comment}
                      />
                    </>
                  ) : null}
                </>
              ) : null}

              {error ? (
                <Text variant="caption" color={colors.danger}>
                  {error}
                </Text>
              ) : null}

              <Button
                label="Submit"
                variant="neutral"
                fullWidth
                disabled={rating === 0}
                loading={phase === 'sending'}
                onPress={() => {
                  void send();
                }}
                style={styles.submit}
              />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    gap: spacing[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingBottom: spacing[3],
    marginBottom: spacing[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stars: {
    flexDirection: 'row',
    gap: spacing[4],
  },
  star: {
    fontSize: 40,
    lineHeight: 46,
  },
  question: {
    marginTop: spacing[2],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: '#BBBBBB',
    borderColor: '#DADADA',
  },
  chipLabel: {
    fontWeight: '600',
  },
  chipLabelSelected: {
    fontWeight: '700',
  },
  comment: {
    minHeight: 84,
    maxHeight: 140,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    fontSize: 16,
    textAlignVertical: 'top',
  },
  submit: {
    marginTop: spacing[3],
  },
  body: {
    lineHeight: 20,
  },
  thanks: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[7],
    paddingBottom: spacing[5],
    gap: spacing[2],
  },
});
