import { Image } from 'react-native';

/** QR.svg in white on a 27-unit grid, rendered large so it stays crisp while the scanner grows out of it. */
export const QR_CODE_GLYPH = require('@cuub/assets/illustrations/QrCode.png');

export function QrCodeIcon({ size }: { size: number }) {
  return <Image source={QR_CODE_GLYPH} style={{ width: size, height: size }} />;
}
