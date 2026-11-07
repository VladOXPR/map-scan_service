import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  FadeIn,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, GradientButton, Text } from '@/components/ui';
import type { UnlockState } from '@/features/rentals/hooks';
import { colors, motion, spacing } from '@/theme';
import { PowerBankRelease } from './PowerBankRelease';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const BLUR_INTENSITY = 55;
/** How long the scanner's square takes to open into the white page. */
export const PAGE_OPEN_MS = 520;
const ART_WIDTH = 280;
/** The bank slides out once the page has mostly faded in. */
const BANK_DELAY_MS = PAGE_OPEN_MS + motion.base;
const INK_MUTED = '#5F5F66';
/** How long "Enjoy your charge" stays up before going back to the map. */
const HOME_AFTER_MS = 2600;

type Copy = { key: string; title: string; body: string | null };

function copyFor(state: UnlockState): Copy | null {
  switch (state.phase) {
    case 'released':
      return { key: 'released', title: 'Enjoy your charge', body: null };
    case 'slow':
      return {
        key: 'slow',
        title: 'Still releasing…',
        body: "The station is taking longer than usual. If nothing comes out, it's canceled automatically and you're not charged.",
      };
    case 'failed':
      return { key: 'failed', title: "Couldn't unlock", body: state.message };
    default:
      return null;
  }
}

type ScanReleaseOverlayProps = {
  state: UnlockState;
  /** False while POST /app/rentals is in flight: only the blur shows, under the scanner's spinning diamond. */
  showStatus: boolean;
  onRetry: () => void;
  onClose: () => void;
  onHome: () => void;
};

/**
 * Blurs the frozen camera frame once a station QR is read. When the release
 * starts, the scanner's square opens into a white page (drawn here once it
 * covers the screen) with the power bank sliding out of its slot.
 */
export function ScanReleaseOverlay({ state, showStatus, onRetry, onClose, onHome }: ScanReleaseOverlayProps) {
  const insets = useSafeAreaInsets();
  const onHomeRef = useRef(onHome);
  onHomeRef.current = onHome;
  const [pageOpen, setPageOpen] = useState(false);

  const blur = useSharedValue(0);
  const page = useSharedValue(0);

  useEffect(() => {
    blur.value = withTiming(BLUR_INTENSITY, { duration: motion.slow });
  }, [blur]);

  useEffect(() => {
    if (!showStatus) {
      page.value = 0;
      setPageOpen(false);
      return;
    }
    page.value = withDelay(PAGE_OPEN_MS, withTiming(1, { duration: 0 }));
    const timer = setTimeout(() => setPageOpen(true), PAGE_OPEN_MS);
    return () => clearTimeout(timer);
  }, [page, showStatus]);

  const released = state.phase === 'released';
  useEffect(() => {
    if (!released) return;
    const timer = setTimeout(() => onHomeRef.current(), HOME_AFTER_MS);
    return () => clearTimeout(timer);
  }, [released]);

  const blurProps = useAnimatedProps(() => ({ intensity: blur.value }));
  const pageStyle = useAnimatedStyle(() => ({ opacity: page.value }));

  const copy = copyFor(state);
  const actions =
    state.phase === 'slow' ? (
      <GradientButton label="Done" onPress={() => onHomeRef.current()} />
    ) : state.phase === 'failed' ? (
      <>
        <GradientButton label="Try again" onPress={onRetry} />
        <Button label="Close" variant="secondary" onPress={onClose} />
      </>
    ) : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <AnimatedBlurView tint="dark" animatedProps={blurProps} style={StyleSheet.absoluteFill} />
      {showStatus ? (
        <>
          {pageOpen ? <StatusBar style="dark" /> : null}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.page, pageStyle]} />
          <Animated.View
            pointerEvents="none"
            entering={FadeIn.delay(PAGE_OPEN_MS).duration(motion.slow)}
            style={[
              StyleSheet.absoluteFill,
              scanPageStyles.content,
              { paddingTop: insets.top, paddingBottom: insets.bottom },
            ]}
          >
            <View style={scanPageStyles.half} />
            <View style={scanPageStyles.art}>
              <PowerBankRelease width={ART_WIDTH} out={state.phase !== 'failed'} delay={BANK_DELAY_MS} />
            </View>
            <View style={[scanPageStyles.half, scanPageStyles.below]}>
              {copy ? (
                <Animated.View key={copy.key} entering={FadeIn.duration(motion.base)} style={scanPageStyles.copy}>
                  <Text center style={scanPageStyles.headline}>
                    {copy.title}
                  </Text>
                  {copy.body ? (
                    <Text center color={INK_MUTED}>
                      {copy.body}
                    </Text>
                  ) : null}
                </Animated.View>
              ) : null}
            </View>
          </Animated.View>
          {actions ? (
            <Animated.View
              entering={FadeIn.duration(motion.base)}
              style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing[5]) }]}
            >
              {actions}
            </Animated.View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** The white scan pages: art in the middle of the screen, title and body under it. */
export const scanPageStyles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing[6],
  },
  half: {
    flex: 1,
    alignSelf: 'stretch',
  },
  below: {
    alignItems: 'center',
    paddingTop: spacing[7],
  },
  copy: {
    gap: spacing[2],
    alignItems: 'center',
  },
  headline: {
    color: colors.black,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  art: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.white,
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing[5],
    gap: spacing[3],
  },
});
