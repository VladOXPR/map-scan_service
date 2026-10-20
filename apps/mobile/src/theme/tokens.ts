export const colors = {
  bg: '#000000',
  surface: '#1C1C1E',
  elevated: '#2C2C2E',
  primary: '#3890F0',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  border: 'rgba(255,255,255,0.12)',
  danger: '#FF453A',
  success: '#30D158',
  overlay: 'rgba(0,0,0,0.45)',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  sheet: 28,
  button: 14,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  button: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
} as const;

export const motion = {
  fast: 150,
  base: 250,
  slow: 400,
} as const;

export const map = {
  styleURL: 'mapbox://styles/mapbox/dark-v11',
  defaultCenter: { latitude: 41.9295, longitude: -87.65 },
  defaultZoom: 13.5,
  /** Camera tilt in degrees — only pitch value used anywhere in the app. */
  tilt: 53,
  stationZoom: 15,
  brandBlue: '#0198FD',
} as const;

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  motion,
  map,
} as const;

export type Theme = typeof theme;
