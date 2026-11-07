import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

type ReturnAlertsSheetProps = {
  visible: boolean;
  loading: boolean;
  onTurnOn: () => void;
  onNotNow: () => void;
};

/** Asked once, while the first power bank is out. Renting works the same either way. */
export function ReturnAlertsSheet({ visible, loading, onTurnOn, onNotNow }: ReturnAlertsSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onNotNow}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={loading ? undefined : onNotNow} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[5]) }]}>
          <Text variant="title" style={styles.title}>
            Get return alerts?
          </Text>
          <Text muted style={styles.body}>
            While you have a power bank, CUUB uses your location to let you know when you pass a station with an
            open slot. Your route stays on your phone.
          </Text>
          <Text muted variant="caption" style={styles.note}>
            It stops when you return the power bank, or after 24 hours. You can turn it off anytime by tapping the
            timer at the top of the map.
          </Text>

          <View style={styles.actions}>
            <Button label="Turn on alerts" variant="neutral" fullWidth loading={loading} onPress={onTurnOn} />
            <Button label="Not now" variant="ghost" fullWidth disabled={loading} onPress={onNotNow} />
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: '#161616',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    gap: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: {
    marginBottom: spacing[1],
  },
  body: {
    lineHeight: 20,
  },
  note: {
    lineHeight: 18,
    marginBottom: spacing[2],
  },
  actions: {
    gap: spacing[2],
  },
});
