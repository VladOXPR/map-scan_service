import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui';
import { colors } from '@/theme';

const TRACK = 10;
const KNOB = 13;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

function spanLabel(ms: number): string {
  if (ms >= DAY_MS) {
    const days = Math.floor(ms / DAY_MS);
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (ms >= HOUR_MS) return `${Math.floor(ms / HOUR_MS)} h`;
  return `${Math.max(0, Math.floor(ms / 60_000))} min`;
}

function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

type ReturnByLineProps = {
  startedAt: string;
  returnBy: string;
};

/** How far into the return window the power bank is, like a video's progress bar. */
export function ReturnByLine({ startedAt, returnBy }: ReturnByLineProps) {
  const now = useMinuteNow();
  const start = new Date(startedAt).getTime();
  const due = new Date(returnBy).getTime();
  const elapsed = Math.max(0, now - start);
  const left = due - now;
  const progress = due > start ? Math.min(1, Math.max(0, elapsed / (due - start))) : 1;
  const dueLabel = new Date(returnBy).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`Return by ${dueLabel}. Out ${spanLabel(elapsed)}, ${left > 0 ? `${spanLabel(left)} left` : 'due now'}.`}
    >
      <Text style={styles.title}>Return by {dueLabel}</Text>

      <View style={styles.bar}>
        <View style={styles.track} />
        <LinearGradient
          colors={['#22B0F7', '#0099FF', '#2068E0']}
          locations={[0, 0.47, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.fill, { width: `${progress * 100}%` }]}
        />
        <View style={[styles.knob, { left: `${progress * 100}%` }]} />
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.time}>{spanLabel(elapsed)}</Text>
        <Text style={[styles.time, left <= 0 && styles.due]}>
          {left > 0 ? `${spanLabel(left)} left` : 'Due now'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  title: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  bar: {
    height: KNOB,
    justifyContent: 'center',
  },
  track: {
    height: TRACK,
    backgroundColor: '#404040',
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: TRACK,
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    marginLeft: -KNOB / 2,
    backgroundColor: '#D9D9D9',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: '#9A9A9A',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  due: {
    color: colors.danger,
  },
});
