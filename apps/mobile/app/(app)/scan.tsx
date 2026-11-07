import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeStationCode, parseStationLink } from '@cuub/core';
import { parseTileParam, type TileFrame } from '@/components/overlays/MapChrome';
import {
  PAGE_OPEN_MS,
  ScanReleaseOverlay,
  scanPageStyles,
} from '@/components/overlays/ScanReleaseOverlay';
import {
  Button,
  LoadingState,
  QR_TAP_GLYPH,
  QR_TAP_GRADIENT,
  qrTapCorner,
  qrTapRim,
  Text,
} from '@/components/ui';
import { unlockGate } from '@/features/auth/gate';
import { stationPath } from '@/features/auth/routes';
import { isUnlockBlockReason } from '@/features/rentals/api';
import { useUnlock } from '@/features/rentals/hooks';
import { tracker } from '@/lib/analytics';
import { getLinkHosts } from '@/lib/config';
import { useAuthStore } from '@/store/authStore';
import { colors, motion, radius, spacing } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ScanEntry = 'map' | 'station' | 'rental_card' | 'membership';
/** The viewfinder square, centred on the screen: the instructions zoom the station's QR square onto it. */
const FRAME = 248;
/** From the screen's centre to the top of the line under the square. */
const BELOW_FRAME = FRAME / 2 + spacing[6];
const INVALID_RESET_MS = 2500;

function isEntry(value: unknown): value is ScanEntry {
  return value === 'map' || value === 'station' || value === 'rental_card' || value === 'membership';
}

export default function ScanScreen() {
  const params = useLocalSearchParams<{ entry?: string; unlock?: string; tile?: string }>();
  const entry: ScanEntry = isEntry(params.entry) ? params.entry : 'map';
  const unlockNow = normalizeStationCode(typeof params.unlock === 'string' ? params.unlock : null);
  const tile = parseTileParam(params.tile);
  const [instructed, setInstructed] = useState(false);
  const onInstructed = useCallback(() => setInstructed(true), []);
  if (unlockNow) return <Scanner entry={entry} active={false} unlockNow={unlockNow} />;
  const page = (
    <View style={styles.page}>
      <Scanner entry={entry} active={instructed} />
      <ScanInstructions onDone={onInstructed} />
    </View>
  );
  return tile ? <TileReveal tile={tile}>{page}</TileReveal> : page;
}

/**
 * Until `active`, the camera neither asks for permission nor reads codes: the instructions are still on top.
 * With `unlockNow` (a station already in front of the person) there is no camera: the unlock for that
 * station starts at once and its release plays over the screen underneath.
 */
function Scanner({ entry, active, unlockNow }: { entry: ScanEntry; active: boolean; unlockNow?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const handled = useRef(false);
  const lastInvalid = useRef<string | null>(null);
  const session = useAuthStore((s) => s.session);
  /** The scanned station being unlocked right here; null while still scanning. */
  const [unlockCode, setUnlockCode] = useState<string | null>(unlockNow ?? null);
  const { state: unlockState, unlock } = useUnlock();
  const cameraRef = useRef<CameraView>(null);
  const goHome = useCallback(() => router.replace('/(app)'), [router]);
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)');
  }, [router]);

  const startedNow = useRef(false);
  useEffect(() => {
    if (!unlockNow || startedNow.current) return;
    startedNow.current = true;
    void unlock(unlockNow);
  }, [unlock, unlockNow]);

  /** The invalid-code message and flashlight fade out the moment a station code is read. */
  const chrome = useSharedValue(unlockNow ? 0 : 1);
  useEffect(() => {
    chrome.value = withTiming(unlockCode ? 0 : 1, { duration: motion.fast });
  }, [chrome, unlockCode]);
  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));

  // Refusals that need the person (membership, card, busy or empty cabinet) are handled on the station screen.
  useEffect(() => {
    if (!unlockCode || unlockState.phase !== 'failed' || !isUnlockBlockReason(unlockState.reason)) return;
    if (unlockNow) close();
    else router.replace(stationPath(unlockCode, 'qr_scan') as Href);
  }, [close, router, unlockCode, unlockNow, unlockState]);

  useEffect(() => {
    if (!unlockNow) tracker.track('scanner_opened', { entry });
  }, [entry, unlockNow]);

  useEffect(() => {
    if (!active) return;
    if (!permission || permission.granted || !permission.canAskAgain || permission.status !== 'undetermined') return;
    tracker.permission('camera', 'prompted');
    void requestPermission().then((result) => {
      tracker.permission(
        'camera',
        'result',
        result.granted ? 'granted' : result.canAskAgain ? 'denied' : 'blocked',
      );
    });
  }, [active, permission, requestPermission]);

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

  if (!unlockNow && !permission) return <LoadingState />;

  if (!unlockNow && permission && !permission.granted) {
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
  const frameStage: FrameStage = !unlockCode ? 'scan' : showStatus ? 'page' : 'loading';

  return (
    <View style={[styles.root, unlockNow ? styles.rootClear : null]}>
      {unlockNow ? null : (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={unlockCode || !active ? undefined : onScanned}
        />
      )}

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
        <Animated.View
          style={[styles.hint, chromeStyle]}
          accessibilityElementsHidden={!invalid}
          importantForAccessibility={invalid ? 'auto' : 'no-hide-descendants'}
        >
          <Text
            center
            color={colors.white}
            variant="subtitle"
            style={[styles.hintText, !invalid && styles.hidden]}
          >
            That's not a CUUB station code
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

      {unlockNow ? null : (
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
      )}
    </View>
  );
}

const REVEAL_MS = 450;
const REVEAL_EASING = Easing.bezier(0.4, 0, 0.2, 1);
/** Close to the iPhone's own screen corners, so the page lands without a visible corner change. */
const PAGE_CORNER = 44;

/**
 * Opened from the map, the whole scanner page grows out of the QR tile in the
 * Unlock powerbank button: the tile's face fades as it opens onto the camera.
 */
function TileReveal({ tile, children }: { tile: TileFrame; children: ReactNode }) {
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();
  const tileCorner = qrTapCorner(tile.size);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: REVEAL_MS, easing: REVEAL_EASING });
    // Leaving the scanner still fades back to the map.
    const timer = setTimeout(() => navigation.setOptions({ animation: 'fade' }), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [navigation, progress]);

  const corner = useDerivedValue(() =>
    progress.value < 1 ? tileCorner + (PAGE_CORNER - tileCorner) * progress.value : 0,
  );
  const maskStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      left: tile.x * (1 - p),
      top: tile.y * (1 - p),
      width: tile.size + (width - tile.size) * p,
      height: tile.size + (height - tile.size) * p,
      borderRadius: corner.value,
    };
  });
  // The page stays put on screen while the mask around it grows.
  const pageStyle = useAnimatedStyle(() => ({
    left: -tile.x * (1 - progress.value),
    top: -tile.y * (1 - progress.value),
  }));
  const faceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
  }));
  const rimStyle = useAnimatedStyle(() => ({ borderRadius: corner.value }));
  const glyphStyle = useAnimatedStyle(() => {
    const side = tile.size + (width - tile.size) * progress.value;
    return { width: side, height: side };
  });

  return (
    <Animated.View style={[styles.reveal, maskStyle]}>
      <Animated.View style={[styles.revealPage, { width, height }, pageStyle]}>{children}</Animated.View>
      <Animated.View pointerEvents="none" style={[styles.revealFace, faceStyle]}>
        <LinearGradient colors={QR_TAP_GRADIENT} style={StyleSheet.absoluteFill} />
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderWidth: qrTapRim(tile.size), borderColor: colors.white },
            rimStyle,
          ]}
        />
        <Animated.Image source={QR_TAP_GLYPH} style={glyphStyle} />
      </Animated.View>
    </Animated.View>
  );
}

const INSTRUCTIONS_ZOOM_DELAY_MS = 600;
const INSTRUCTIONS_ZOOM_MS = 1800;
/** Until the fade into the camera; the blue already covers the screen through the zoom's last stretch. */
const INSTRUCTIONS_HOLD_MS = INSTRUCTIONS_ZOOM_DELAY_MS + INSTRUCTIONS_ZOOM_MS + 250;
const INSTRUCTIONS_FADE_MS = 400;
/**
 * The title steps aside while the station grows over it, and comes back in
 * white once the panel's bottom edge has passed below it (around 0.8). Keyed
 * to the zoom, where 1 is the QR square reaching the scanner's square.
 */
const TITLE_OPACITY = { at: [0, 0.12, 0.8, 0.95], value: [1, 0, 0, 1] };
/** How far either side of the threshold the QR square eases from following the station to standing still. */
const QR_SETTLE = 0.15;
/** Station.svg without its blue QR panel, which is drawn as a view so it stays sharp at any zoom. */
const SCAN_STATION = require('@cuub/assets/illustrations/ScanStation.png');
/** The white QR square of the kiosk screen's blue panel (Blue_QR_Panel.svg). */
const BLUE_QR_SQUARE = require('@cuub/assets/illustrations/BlueQrSquare.png');

/** Station.svg's artboard, in its own units. */
const STATION_ART = { width: 282, height: 405 };
/** The station's blue panel (Blue_QR_Panel.svg's outer edge), in station units. */
const PANEL = { x: 140.8244, y: 22.9611, width: 84.9393, height: 99.8998, radius: 4.826, border: 0.6435 };
/** Blue_QR_Panel.svg's radial gradient, as a linear one across the panel. */
const PANEL_GRADIENT = { colors: ['#45B5FF', '#2C80FE'] as const, start: { x: 0, y: 0 }, end: { x: 1.2, y: 0.57 } };
const PANEL_BORDER = '#399AFE';
/** Centre and side of the panel's white QR square (outer edge of its stroke), in station units. */
const PANEL_QR = { x: 183.214, y: 72.912, size: 37.161 };
const STATION_START_HEIGHT = 300;
/** The station is laid out this much bigger than it starts, so it stays sharp as it grows. */
const STATION_HEADROOM = 2.5;

type Box = { left: number; top: number; width: number; height: number };

/**
 * The zoom is measured in steps of `ratio`: at `zoom` z the station is drawn
 * at `startScale * ratio^z` points per station unit, so 0 is the whole station
 * and 1 is its QR square at the scanner's size. It goes on to `end`, where the
 * blue panel covers the screen.
 */
type InstructionsZoom = {
  startScale: number;
  ratio: number;
  end: number;
  /** Zoom at which the panel's top edge reaches the top of the screen. */
  blueAt: number;
  /** Where the station's QR square starts, and where it ends: the scanner's square. */
  startX: number;
  startY: number;
  centerX: number;
  centerY: number;
  /** The station laid out with headroom, in points, and its points per station unit there. */
  stationLayout: Box;
  layoutScale: number;
  qr: Box;
  titleTop: number;
};

function instructionsZoom(width: number, height: number): InstructionsZoom {
  const titleTop = height / 2 + BELOW_FRAME;
  const startScale = STATION_START_HEIGHT / STATION_ART.height;
  const ratio = FRAME / PANEL_QR.size / startScale;
  const start: Box = {
    left: width / 2 - (STATION_ART.width * startScale) / 2,
    top: titleTop - spacing[7] - STATION_START_HEIGHT,
    width: STATION_ART.width * startScale,
    height: STATION_START_HEIGHT,
  };
  const panelHalfWidth = Math.min(PANEL_QR.x - PANEL.x, PANEL.x + PANEL.width - PANEL_QR.x);
  const panelHalfHeight = Math.min(PANEL_QR.y - PANEL.y, PANEL.y + PANEL.height - PANEL_QR.y);
  const coverScale =
    1.02 * Math.max(width / 2 / (panelHalfWidth - PANEL.radius), height / 2 / (panelHalfHeight - PANEL.radius));
  const zoomAt = (scale: number) => Math.log(scale / startScale) / Math.log(ratio);
  return {
    startScale,
    ratio,
    end: Math.max(zoomAt(coverScale), 1 + QR_SETTLE),
    blueAt: zoomAt(height / 2 / (PANEL_QR.y - PANEL.y)),
    startX: start.left + PANEL_QR.x * startScale,
    startY: start.top + PANEL_QR.y * startScale,
    centerX: width / 2,
    centerY: height / 2,
    stationLayout: {
      left: start.left - (start.width * (STATION_HEADROOM - 1)) / 2,
      top: start.top - (start.height * (STATION_HEADROOM - 1)) / 2,
      width: start.width * STATION_HEADROOM,
      height: start.height * STATION_HEADROOM,
    },
    layoutScale: startScale * STATION_HEADROOM,
    qr: { left: width / 2 - FRAME / 2, top: height / 2 - FRAME / 2, width: FRAME, height: FRAME },
    titleTop,
  };
}

/**
 * The station's scale and where its QR square's centre is at `z`. The square
 * glides onto the scanner's square, arriving at 1 without a jolt, and from
 * there the station grows around it.
 */
function stationAt(z: number, zoom: InstructionsZoom) {
  'worklet';
  const grown = Math.pow(zoom.ratio, z);
  const pan = z < 1 ? Math.pow((zoom.ratio - grown) / (zoom.ratio - 1), 2) : 0;
  return {
    scale: zoom.startScale * grown,
    x: zoom.centerX + (zoom.startX - zoom.centerX) * pan,
    y: zoom.centerY + (zoom.startY - zoom.centerY) * pan,
  };
}

/** The QR square follows the station's zoom up to the threshold, easing to a stop at 1 instead of halting. */
function qrZoom(z: number) {
  'worklet';
  if (z <= 1 - QR_SETTLE) return z;
  if (z >= 1 + QR_SETTLE) return 1;
  const over = z - (1 - QR_SETTLE);
  return z - (over * over) / (4 * QR_SETTLE);
}

/**
 * Where to find the code, shown each time the scanner opens: one zoom into
 * the station's blue panel. Its QR square comes to rest where the scanner's
 * square will be while the station keeps growing around it until the blue
 * fills the screen. Then it fades into the camera. A tap skips it.
 */
function ScanInstructions({ onDone }: { onDone: () => void }) {
  const opacity = useSharedValue(1);
  const progress = useSharedValue(0);
  const [zoom, setZoom] = useState<InstructionsZoom | null>(null);
  const [blue, setBlue] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    progress.value = withDelay(
      INSTRUCTIONS_ZOOM_DELAY_MS,
      withTiming(1, { duration: INSTRUCTIONS_ZOOM_MS, easing: Easing.inOut(Easing.cubic) }),
    );
    const timer = setTimeout(() => setLeaving(true), INSTRUCTIONS_HOLD_MS);
    return () => clearTimeout(timer);
  }, [progress]);

  useAnimatedReaction(
    () => (zoom ? progress.value * zoom.end >= zoom.blueAt : false),
    (now, before) => {
      if (now && !before) runOnJS(setBlue)(true);
    },
    [zoom],
  );

  useEffect(() => {
    if (!leaving) return;
    onDone();
    opacity.value = withTiming(0, { duration: INSTRUCTIONS_FADE_MS, easing: Easing.out(Easing.cubic) });
    const timer = setTimeout(() => setGone(true), INSTRUCTIONS_FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const stationStyle = useAnimatedStyle(() => {
    if (!zoom) return {};
    const at = stationAt(progress.value * zoom.end, zoom);
    const layout = zoom.stationLayout;
    return {
      transform: [
        { translateX: at.x - (layout.left + layout.width / 2) + at.scale * (STATION_ART.width / 2 - PANEL_QR.x) },
        { translateY: at.y - (layout.top + layout.height / 2) + at.scale * (STATION_ART.height / 2 - PANEL_QR.y) },
        { scale: at.scale / zoom.layoutScale },
      ],
    };
  }, [zoom]);
  const qrStyle = useAnimatedStyle(() => {
    if (!zoom) return {};
    const z = progress.value * zoom.end;
    const at = stationAt(z, zoom);
    return {
      transform: [
        { translateX: at.x - zoom.centerX },
        { translateY: at.y - zoom.centerY },
        { scale: (zoom.startScale * Math.pow(zoom.ratio, qrZoom(z)) * PANEL_QR.size) / FRAME },
      ],
    };
  }, [zoom]);
  const titleStyle = useAnimatedStyle(() => {
    const z = zoom ? progress.value * zoom.end : 0;
    return {
      opacity: interpolate(z, TITLE_OPACITY.at, TITLE_OPACITY.value, Extrapolation.CLAMP),
      color: z < 0.5 ? colors.black : colors.white,
    };
  }, [zoom]);
  if (gone) return null;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel="Scan QR code"
      accessibilityHint="Opens the camera"
      onPress={() => setLeaving(true)}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setZoom(instructionsZoom(width, height));
      }}
      disabled={leaving}
      style={[styles.instructions, style]}
    >
      {leaving || blue ? null : <StatusBar style="dark" />}
      {zoom ? (
        <>
          <Animated.View style={[styles.zoomLayer, zoom.stationLayout, stationStyle]}>
            <Image
              source={SCAN_STATION}
              style={{ width: zoom.stationLayout.width, height: zoom.stationLayout.height }}
            />
            <View
              style={[
                styles.panel,
                {
                  left: PANEL.x * zoom.layoutScale,
                  top: PANEL.y * zoom.layoutScale,
                  width: PANEL.width * zoom.layoutScale,
                  height: PANEL.height * zoom.layoutScale,
                  borderRadius: PANEL.radius * zoom.layoutScale,
                },
              ]}
            >
              <LinearGradient
                colors={PANEL_GRADIENT.colors}
                start={PANEL_GRADIENT.start}
                end={PANEL_GRADIENT.end}
                style={StyleSheet.absoluteFill}
              />
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: PANEL.radius * zoom.layoutScale,
                    borderWidth: PANEL.border * zoom.layoutScale,
                    borderColor: PANEL_BORDER,
                  },
                ]}
              />
            </View>
          </Animated.View>
          <Animated.Image source={BLUE_QR_SQUARE} style={[styles.zoomLayer, zoom.qr, qrStyle]} />
          <Animated.Text style={[scanPageStyles.headline, styles.instructionsTitle, { top: zoom.titleTop }, titleStyle]}>
            Scan QR code
          </Animated.Text>
        </>
      ) : null}
    </AnimatedPressable>
  );
}

type FrameStage = 'scan' | 'loading' | 'page';
const DIAMOND = 34;
/** Lets the release overlay's own white page settle in before the square fades off it. */
const PAGE_HANDOFF_MS = 80;

/**
 * The viewfinder square. On a read it closes into a small white diamond that
 * spins while the unlock request is in flight, then squares up and opens into
 * the white page the release plays on.
 */
function ScanFrame({ stage, invalid }: { stage: FrameStage; invalid: boolean }) {
  const { width, height } = useWindowDimensions();
  const pageSize = 2 * Math.max(width, height);
  // Opened straight into an unlock, there was no square to close: the diamond is already there.
  const size = useSharedValue(stage === 'scan' ? FRAME : DIAMOND);
  const rotation = useSharedValue(0);
  const fill = useSharedValue(stage === 'scan' ? 0 : 1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (stage === 'scan') return;
    if (stage === 'loading') {
      const settle = { duration: 420, easing: Easing.out(Easing.cubic) };
      opacity.value = 1;
      size.value = withTiming(DIAMOND, settle);
      fill.value = withTiming(1, settle);
      rotation.value = withSequence(
        withTiming(45, settle),
        withRepeat(withTiming(225, { duration: 1100, easing: Easing.inOut(Easing.cubic) }), -1),
      );
      return;
    }
    const open = { duration: PAGE_OPEN_MS, easing: Easing.inOut(Easing.cubic) };
    cancelAnimation(rotation);
    rotation.value = withTiming(Math.ceil(rotation.value / 90) * 90, open);
    fill.value = withTiming(1, open);
    size.value = withTiming(pageSize, open);
    opacity.value = withDelay(PAGE_OPEN_MS + PAGE_HANDOFF_MS, withTiming(0, { duration: motion.fast }));
  }, [fill, opacity, pageSize, rotation, size, stage]);

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
  rootClear: {
    backgroundColor: 'transparent',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameBox: {
    width: FRAME,
    height: FRAME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reveal: {
    position: 'absolute',
    overflow: 'hidden',
  },
  revealPage: {
    position: 'absolute',
  },
  revealFace: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
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
    position: 'absolute',
    top: '50%',
    marginTop: BELOW_FRAME,
    left: spacing[5],
    right: spacing[5],
  },
  // No backing pill, so a soft shadow keeps the words readable over a bright camera view.
  hintText: {
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  hidden: {
    opacity: 0,
  },
  page: {
    flex: 1,
  },
  instructions: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  zoomLayer: {
    position: 'absolute',
  },
  panel: {
    position: 'absolute',
    overflow: 'hidden',
  },
  instructionsTitle: {
    position: 'absolute',
    left: spacing[6],
    right: spacing[6],
    textAlign: 'center',
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
