import { Platform, StyleSheet, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Classic status bar inset — no notch / Dynamic Island above this. */
const LEGACY_STATUS_BAR_TOP = 20;

/** 1–100; maps to iOS UIVisualEffectView strength (not a pixel radius). */
export const MAP_TOP_BLUR_INTENSITY = 55;

/**
 * Frosted blur only in the notch / Dynamic Island band so system status
 * icons stay readable. Hidden on phones with a standard status bar.
 */
export function MapTopBlur() {
  const insets = useSafeAreaInsets();

  if (insets.top <= LEGACY_STATUS_BAR_TOP) {
    return null;
  }

  const mask = (
    <LinearGradient
      colors={[
        '#000000',
        '#000000',
        'rgba(0,0,0,0.35)',
        'rgba(0,0,0,0)',
      ]}
      locations={[0, 0.38, 0.82, 1]}
      style={StyleSheet.absoluteFill}
    />
  );

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { height: insets.top }]}
    >
      <MaskedView style={StyleSheet.absoluteFill} maskElement={mask}>
        {Platform.OS === 'ios' ? (
          <BlurView
            tint="systemUltraThinMaterialDark"
            intensity={MAP_TOP_BLUR_INTENSITY}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.androidFallback} />
        )}
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
  androidFallback: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(22,22,22,0.55)',
  },
});
