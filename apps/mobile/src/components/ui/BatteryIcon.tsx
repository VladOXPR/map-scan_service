import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

const BODY_WIDTH = 46;
const BODY_HEIGHT = 22;
const BORDER = 2;
const PADDING = 2.5;
const INNER_WIDTH = BODY_WIDTH - 2 * (BORDER + PADDING);

type BatteryIconProps = {
  /** 0–1; null draws an empty battery. */
  level: number | null;
};

/** iOS status-bar style battery with a blue charge fill. */
export function BatteryIcon({ level }: BatteryIconProps) {
  const fill = level == null ? 0 : Math.max(level > 0 ? 3 : 0, INNER_WIDTH * level);

  return (
    <View style={styles.row}>
      <View style={styles.body}>
        <View style={[styles.fill, { width: fill }]} />
      </View>
      <View style={styles.cap} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  body: {
    width: BODY_WIDTH,
    height: BODY_HEIGHT,
    borderRadius: 7,
    borderWidth: BORDER,
    borderColor: 'rgba(255,255,255,0.4)',
    padding: PADDING,
  },
  fill: {
    height: '100%',
    borderRadius: 3.5,
    backgroundColor: colors.primary,
  },
  cap: {
    width: 3.5,
    height: 8,
    marginLeft: 2,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
