import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme';

/** QR.svg in dark gray, centred at 60% of the tile and rendered large so it stays crisp as the scanner grows out of it. */
export const QR_TAP_GLYPH = require('@cuub/assets/illustrations/QrTapCode.png');
export const QR_TAP_GRADIENT = [colors.white, '#E8E8E8'] as const;
export const qrTapCorner = (size: number) => (size * 19) / 92;
export const qrTapRim = (size: number) => (size * 3) / 92;

/**
 * The kiosk's QR_tap.svg tile at any size: a white to #E8E8E8 square with
 * 19/92 corners, a 3/92 white rim, and the dark gray QR code.
 */
export function QrTapIcon({ size }: { size: number }) {
  const corner = qrTapCorner(size);
  return (
    <View style={{ width: size, height: size, borderRadius: corner, overflow: 'hidden' }}>
      <LinearGradient colors={QR_TAP_GRADIENT} style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: corner, borderWidth: qrTapRim(size), borderColor: colors.white },
        ]}
      />
      {/* Sized explicitly: without it the image keeps the PNG's own 248pt size. */}
      <Image source={QR_TAP_GLYPH} style={[StyleSheet.absoluteFill, { width: size, height: size }]} />
    </View>
  );
}
