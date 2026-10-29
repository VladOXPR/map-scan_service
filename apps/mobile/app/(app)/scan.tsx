import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseStationLink } from '@cuub/core';
import { Button, LoadingState, Text } from '@/components/ui';
import { stationPath } from '@/features/auth/routes';
import { tracker } from '@/lib/analytics';
import { getLinkHosts } from '@/lib/config';
import { colors, radius, spacing } from '@/theme';

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
    router.replace(stationPath(link.code, 'qr_scan') as Href);
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

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />

      <View pointerEvents="none" style={styles.overlay}>
        <View style={[styles.frame, invalid && { borderColor: colors.danger }]} />
        <View style={styles.hint}>
          <Text center color={colors.white} variant="subtitle">
            {invalid ? "That's not a CUUB station code" : 'Point at the QR code on the station'}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close scanner"
        onPress={close}
        style={[styles.roundButton, { top: insets.top + spacing[2], left: spacing[5] }]}
        hitSlop={8}
      >
        <Text style={styles.closeIcon}>×</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={torch ? 'Turn off flashlight' : 'Turn on flashlight'}
        onPress={() => setTorch((on) => !on)}
        style={[
          styles.torch,
          { bottom: insets.bottom + spacing[7] },
          torch && { backgroundColor: colors.white },
        ]}
      >
        <Text variant="button" color={torch ? colors.black : colors.white}>
          {torch ? 'Light on' : 'Light'}
        </Text>
      </Pressable>
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
