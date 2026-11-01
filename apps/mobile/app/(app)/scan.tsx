import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseStationLink } from '@cuub/core';
import { ScanReleaseOverlay } from '@/components/overlays/ScanReleaseOverlay';
import { Button, LoadingState, Text } from '@/components/ui';
import { unlockGate } from '@/features/auth/gate';
import { stationPath } from '@/features/auth/routes';
import { isUnlockBlockReason } from '@/features/rentals/api';
import { useUnlock } from '@/features/rentals/hooks';
import { tracker } from '@/lib/analytics';
import { getLinkHosts } from '@/lib/config';
import { useAuthStore } from '@/store/authStore';
import { colors, motion, radius, spacing } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ScanEntry = 'map' | 'station' | 'rental_card';
const FRAME = 248;
const INVALID_RESET_MS = 2500;

function isEntry(value: unknown): value is ScanEntry {
  return value === 'map' || value === 'station' || value === 'rental_card';
}

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ entry?: string }>();
  const entry: ScanEntry = isEntry(params.entry) ? params.entry : 'map';
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const handled = useRef(false);
  const lastInvalid = useRef<string | null>(null);
  const session = useAuthStore((s) => s.session);
  /** The scanned station being unlocked right here; null while still scanning. */
  const [unlockCode, setUnlockCode] = useState<string | null>(null);
  const { state: unlockState, unlock } = useUnlock();
  const cameraRef = useRef<CameraView>(null);
  const goHome = useCallback(() => router.replace('/(app)'), [router]);

  /** Hint and flashlight fade out the moment a station code is read. */
  const chrome = useSharedValue(1);
  useEffect(() => {
    chrome.value = withTiming(unlockCode ? 0 : 1, { duration: motion.fast });
  }, [chrome, unlockCode]);
  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));

  // Refusals that need the person (membership, card, busy or empty cabinet) are handled on the station screen.
  useEffect(() => {
    if (!unlockCode || unlockState.phase !== 'failed' || !isUnlockBlockReason(unlockState.reason)) return;
    router.replace(stationPath(unlockCode, 'qr_scan') as Href);
  }, [router, unlockCode, unlockState]);

  useEffect(() => {
    tracker.track('scanner_opened', { entry });
  }, [entry]);

  useEffect(() => {
    if (!permission || permission.granted || !permission.canAskAgain || permission.status !== 'undetermined') return;
    tracker.permission('camera', 'prompted');
    void requestPermission().then((result) => {
      tracker.permission(
        'camera',
        'result',
        result.granted ? 'granted' : result.canAskAgain ? 'denied' : 'blocked',
      );
    });
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!invalid) return;
    const timer = setTimeout(() => {
      setInvalid(false);
      lastInvalid.current = null;
    }, INVALID_RESET_MS);
    return () => clearTimeout(timer);
  }, [invalid]);

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (handled.current || data === lastInvalid.current) return;
    const link = parseStationLink(data, getLinkHosts());
    if (!link) {
      lastInvalid.current = data;
      tracker.track('qr_scanned', { valid: false });
      setInvalid(true);
      return;
    }
    handled.current = true;
    tracker.track('qr_scanned', { valid: true, stationCode: link.code });
    tracker.deeplink({ url: data, source: 'qr_scan', stationCode: link.code });
    if (link.webVisitorId) void tracker.linkWebVisitor(link.webVisitorId);
    if (unlockGate(session, stationPath(link.code)).step !== 'ready') {
      router.replace(stationPath(link.code, 'qr_scan') as Href);
      return;
    }
    void cameraRef.current?.pausePreview();
    setUnlockCode(link.code);
    void unlock(link.code);
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)');
  };

  if (!permission) return <LoadingState />;

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <View style={[styles.permission, { paddingTop: insets.top + spacing[9], paddingBottom: insets.bottom + spacing[5] }]}>
        <View style={{ gap: spacing[3] }}>
          <Text style={styles.headline}>Scan a station</Text>
          <Text muted>
            CUUB uses your camera to read the QR code on the front of a station so you can unlock a power bank.
          </Text>
        </View>
        <View style={{ gap: spacing[3] }}>
          <Button
            label={blocked ? 'Open Settings' : 'Allow camera'}
            onPress={() => {
              if (blocked) {
                void Linking.openSettings();
                return;
              }
              tracker.permission('camera', 'prompted');
              void requestPermission().then((result) =>
                tracker.permission(
                  'camera',
                  'result',
                  result.granted ? 'granted' : result.canAskAgain ? 'denied' : 'blocked',
                ),
              );
            }}
          />
          <Button label="Not now" variant="ghost" onPress={close} />
        </View>
      </View>
    );
  }

  const busy = unlockState.phase === 'requesting' || unlockState.phase === 'releasing';
  const refused = unlockState.phase === 'failed' && isUnlockBlockReason(unlockState.reason);
  const showStatus =
    unlockState.phase === 'releasing' ||
    unlockState.phase === 'released' ||
    unlockState.phase === 'slow' ||
    (unlockState.phase === 'failed' && !refused);
  const frameStage: FrameStage = !unlockCode ? 'scan' : showStatus ? 'gone' : 'loading';

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={unlockCode ? undefined : onScanned}
      />

      {unlockCode ? (
        <ScanReleaseOverlay
          state={unlockState}
          showStatus={showStatus}
          onRetry={() => void unlock(unlockCode)}
          onClose={close}
          onHome={goHome}
        />
      ) : null}

      <View pointerEvents="none" style={styles.overlay}>
        <ScanFrame stage={frameStage} invalid={invalid} />
        <Animated.View style={[styles.hint, chromeStyle]}>
          <Text center color={colors.white} variant="subtitle">
            {invalid ? "That's not a CUUB station code" : 'Point at the QR code on the station'}
          </Text>
        </Animated.View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close scanner"
        onPress={close}
        disabled={busy}
        style={[styles.roundButton, { top: insets.top + spacing[2], left: spacing[5] }]}
        hitSlop={8}
      >
        <Text style={styles.closeIcon}>×</Text>
      </Pressable>

      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={torch ? 'Turn off flashlight' : 'Turn on flashlight'}
        onPress={() => setTorch((on) => !on)}
        disabled={Boolean(unlockCode)}
        style={[
          styles.torch,
          { bottom: insets.bottom + spacing[7] },
          torch && { backgroundColor: colors.white },
          chromeStyle,
        ]}
      >
        <Text variant="button" color={torch ? colors.black : colors.white}>
          {torch ? 'Light on' : 'Light'}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

type FrameStage = 'scan' | 'loading' | 'gone';
const DIAMOND = 34;

/**
 * The viewfinder square. On a read it closes into a small white diamond that
 * spins while the unlock request is in flight, then drops away for the status.
 */
function ScanFrame({ stage, invalid }: { stage: FrameStage; invalid: boolean }) {
  const size = useSharedValue(FRAME);
  const rotation = useSharedValue(0);
  const fill = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (stage === 'scan') return;
    if (stage === 'loading') {
      const settle = { duration: 420, easing: Easing.out(Easing.cubic) };
      opacity.value = withTiming(1, { duration: motion.fast });
      size.value = withTiming(DIAMOND, settle);
      fill.value = withTiming(1, settle);
      rotation.value = withSequence(
        withTiming(45, settle),
        withRepeat(withTiming(225, { duration: 1100, easing: Easing.inOut(Easing.cubic) }), -1),
      );
      return;
    }
    cancelAnimation(rotation);
    size.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) });
    opacity.value = withTiming(0, { duration: 220 });
  }, [fill, opacity, rotation, size, stage]);

  const style = useAnimatedStyle(() => ({
    width: size.value,
    height: size.value,
    opacity: opacity.value,
    borderRadius: interpolate(size.value, [DIAMOND, FRAME], [6, radius.xl], Extrapolation.CLAMP),
    backgroundColor: interpolateColor(fill.value, [0, 1], ['rgba(255,255,255,0)', 'rgba(255,255,255,1)']),
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.frameBox}>
      <Animated.View style={[styles.frame, invalid && stage === 'scan' && { borderColor: colors.danger }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
  },
  frameBox: {
    width: FRAME,
    height: FRAME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME,
    height: FRAME,
    borderRadius: radius.xl,
    borderWidth: 3,
    borderColor: colors.white,
  },
  hint: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
    marginHorizontal: spacing[5],
  },
  roundButton: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(22,22,22,0.85)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '400',
    marginTop: -1,
  },
  torch: {
    position: 'absolute',
    alignSelf: 'center',
    minWidth: 120,
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: 'rgba(22,22,22,0.85)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  permission: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing[5],
    justifyContent: 'space-between',
  },
  headline: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
});
