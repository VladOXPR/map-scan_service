import { useEffect, useState } from 'react';
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
import { Button, Chip, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';
import {
  CANCEL_COMMENT_MAX,
  CANCEL_REASONS,
  formatMoney,
  type CancelReason,
  type Membership,
} from './api';
import { useCancelMembership, useManageMembership } from './hooks';

type Phase = 'manage' | 'reasons' | 'canceled';

type ManagePassSheetProps = {
  visible: boolean;
  membership: Membership;
  card: string | null;
  onClose: () => void;
};

function longDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text muted>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/** Pass details, then the in-app cancel: optional reasons, one tap, access until the period ends. */
export function ManagePassSheet({ visible, membership, card, onClose }: ManagePassSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { cancel, resume } = useCancelMembership();
  const portal = useManageMembership();
  const [phase, setPhase] = useState<Phase>('manage');
  const [reasons, setReasons] = useState<CancelReason[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPhase('manage');
    setReasons([]);
    setComment('');
    setError(null);
  }, [visible]);

  const until = longDate(membership.currentPeriodEnd);
  const price =
    membership.amountCents != null
      ? `${formatMoney(membership.amountCents, membership.currency ?? 'usd')}/${membership.interval ?? 'month'}`
      : null;

  const dismiss = () => {
    if (!busy) onClose();
  };

  const toggleReason = (reason: CancelReason) =>
    setReasons((current) => (current.includes(reason) ? current.filter((r) => r !== reason) : [...current, reason]));

  const run = async (action: () => Promise<unknown>, next: Phase | null) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (next) setPhase(next);
      else onClose();
    } catch {
      setError("Couldn't reach CUUB. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={dismiss}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={dismiss} />
        <View style={[styles.sheet, { maxHeight: height * 0.88, paddingBottom: Math.max(insets.bottom, spacing[5]) }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} bounces={false}>
            <View style={styles.header}>
              <Text variant="subtitle" style={styles.headerTitle}>
                CUUB Pass
              </Text>
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

            {phase === 'manage' ? (
              <>
                <View style={styles.rows}>
                  {price ? <Row label="Plan" value={price} /> : null}
                  {until ? <Row label={membership.cancelAtPeriodEnd ? 'Ends' : 'Renews'} value={until} /> : null}
                  {card ? <Row label="Payment" value={card} /> : null}
                </View>
                {membership.cancelAtPeriodEnd ? (
                  <Text muted style={styles.body}>
                    {until
                      ? `Your Pass is canceled. You have unlimited access until ${until}.`
                      : 'Your Pass is canceled and will not renew.'}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={portal.opening}
                  onPress={() => void portal.open()}
                  hitSlop={8}
                  style={styles.link}
                >
                  <Text variant="caption" muted style={styles.linkLabel}>
                    {portal.opening ? 'Opening…' : 'Update payment method'}
                  </Text>
                </Pressable>
              </>
            ) : null}

            {phase === 'reasons' ? (
              <>
                <Text variant="title">Why are you canceling?</Text>
                <Text muted style={styles.body}>
                  Optional. It helps us make CUUB better.
                </Text>
                <View style={styles.chips}>
                  {CANCEL_REASONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={reasons.includes(option.value)}
                      onPress={() => toggleReason(option.value)}
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
                  maxLength={CANCEL_COMMENT_MAX}
                  style={styles.comment}
                />
                {until ? (
                  <Text variant="caption" muted>
                    You keep unlimited access until {until}.
                  </Text>
                ) : null}
              </>
            ) : null}

            {phase === 'canceled' ? (
              <View style={styles.done}>
                <Text variant="title">Your Pass is canceled</Text>
                <Text muted style={styles.body}>
                  {until
                    ? `You still have unlimited access until ${until}. You won't be charged again.`
                    : "You won't be charged again."}
                </Text>
              </View>
            ) : null}

            {error ? (
              <Text variant="caption" color={colors.danger}>
                {error}
              </Text>
            ) : null}

            {phase === 'manage' && membership.cancelAtPeriodEnd ? (
              <Button
                label="Keep my Pass"
                variant="neutral"
                loading={busy}
                onPress={() => void run(resume, null)}
                style={styles.mainButton}
              />
            ) : null}
            {phase === 'manage' && !membership.cancelAtPeriodEnd ? (
              <Button
                label="Cancel Pass"
                variant="ghost"
                onPress={() => setPhase('reasons')}
                style={styles.mainButton}
              />
            ) : null}
            {phase === 'reasons' ? (
              <Button
                label="Cancel Pass"
                variant="neutral"
                loading={busy}
                onPress={() =>
                  void run(() => cancel({ reasons, comment: comment.trim() || null }), 'canceled')
                }
                style={styles.mainButton}
              />
            ) : null}
            {phase === 'canceled' ? (
              <Button label="Done" variant="neutral" onPress={onClose} style={styles.mainButton} />
            ) : null}
          </ScrollView>
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
    alignItems: 'center',
    gap: spacing[3],
    paddingBottom: spacing[3],
    marginBottom: spacing[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  headerTitle: {
    flex: 1,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rows: {
    gap: spacing[3],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  rowValue: {
    fontWeight: '600',
  },
  body: {
    lineHeight: 20,
  },
  link: {
    alignSelf: 'flex-start',
    paddingVertical: spacing[1],
  },
  linkLabel: {
    textDecorationLine: 'underline',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
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
  done: {
    gap: spacing[2],
    paddingTop: spacing[2],
  },
  /** Same outer size and corners as the map's Scan and Directions buttons. */
  mainButton: {
    marginTop: spacing[3],
    minHeight: 60,
    borderRadius: radius.button + 4,
  },
});
