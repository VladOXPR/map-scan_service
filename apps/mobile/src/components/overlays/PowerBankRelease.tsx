import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors } from '@/theme';

/** Artboard of powerbank_in.svg / powerbank_out.svg: the cabinet slot, and below it the bank once out. */
const ART_W = 362;
const ART_H = 196;
/** How far the bank moves between the in and out drawings. */
const TRAVEL = 105;
/** Top of the slot opening; the bank is hidden above it. */
const SLOT_TOP = 20;
/** Room below the bank at rest, so rounding can't shave its outline. */
const CLIP_SLACK = 4;

const RIM = '#E7E7E7';
const SLOT_TOP_COLOR = '#000000';
const SLOT_BOTTOM_COLOR = '#403D42';
const BODY = '#0099FF';
const CAP = '#7BD0FF';

const SLIDE_MS = 800;
/** Eases in and out without passing the end, so the bank never leaves its clip. */
const SLIDE_EASING = Easing.bezier(0.4, 0, 0.2, 1);

type PowerBankReleaseProps = {
  width: number;
  /** Starts in its slot; becoming true slides it out once, false slides it back in. */
  out: boolean;
  /** Wait before the first slide, e.g. while the page around it fades in. */
  delay?: number;
};

/** A cabinet slot with a power bank sliding out of it, drawn from the two design SVGs. */
export function PowerBankRelease({ width, out, delay = 0 }: PowerBankReleaseProps) {
  const s = width / ART_W;
  const u = (n: number) => n * s;
  const line = Math.max(u(1), StyleSheet.hairlineWidth);

  const position = useSharedValue(0);
  const firstSlide = useRef(true);

  useEffect(() => {
    const slide = withTiming(out ? 1 : 0, { duration: SLIDE_MS, easing: SLIDE_EASING });
    position.value = firstSlide.current ? withDelay(delay, slide) : slide;
    firstSlide.current = false;
  }, [delay, out, position]);

  const bankStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (position.value - 1) * TRAVEL * s }],
  }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Power bank coming out of its slot"
      style={{ width, height: u(ART_H) }}
    >
      <View style={[styles.part, { left: 0, top: 0, width, height: u(134), borderRadius: u(53), backgroundColor: RIM }]}>
        <View style={[styles.part, styles.clip, { left: u(20), top: u(20), width: u(322), height: u(94), borderRadius: u(33) }]}>
          <LinearGradient colors={[SLOT_TOP_COLOR, SLOT_BOTTOM_COLOR]} style={StyleSheet.absoluteFill} />
        </View>
      </View>

      <View style={[styles.part, styles.clip, { left: 0, top: u(SLOT_TOP), width, height: u(ART_H - SLOT_TOP + CLIP_SLACK) }]}>
        <Animated.View style={[styles.part, { left: 0, top: -u(SLOT_TOP), width, height: u(ART_H) }, bankStyle]}>
          <View
            style={[
              styles.part,
              styles.outlined,
              {
                left: u(53),
                top: u(126),
                width: u(256),
                height: u(70),
                borderWidth: line,
                borderBottomLeftRadius: u(37),
                borderBottomRightRadius: u(37),
                backgroundColor: CAP,
              },
            ]}
          />
          <View
            style={[
              styles.part,
              styles.outlined,
              {
                left: u(53),
                top: u(21),
                width: u(256),
                height: u(143),
                borderWidth: line,
                borderBottomLeftRadius: u(37),
                borderBottomRightRadius: u(37),
                backgroundColor: BODY,
              },
            ]}
          />
          <View style={[styles.part, styles.ink, { left: u(79), top: u(162), width: line, height: u(32) }]} />
          <View style={[styles.part, styles.ink, { left: u(279), top: u(163), width: line, height: u(32) }]} />
          <View
            style={[
              styles.part,
              styles.outlined,
              {
                left: u(154),
                top: u(176),
                width: u(53),
                height: u(9),
                borderWidth: line,
                borderRadius: u(4.5),
                backgroundColor: colors.white,
              },
            ]}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  part: {
    position: 'absolute',
  },
  clip: {
    overflow: 'hidden',
  },
  outlined: {
    borderColor: colors.black,
  },
  ink: {
    backgroundColor: colors.black,
  },
});
