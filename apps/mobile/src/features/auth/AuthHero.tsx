import { Image, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { colors, spacing } from '@/theme';

const stationCover = require('../../../assets/illustrations/StationCover.png');

const HERO_GRADIENT = ['#22B1F7', '#1F67E0'] as const;

/** Blue station panel across the top of the sign-up screens, with their close button. */
export function AuthHero({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.hero}>
      <LinearGradient
        colors={[...HERO_GRADIENT]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.heroGradient, { paddingTop: insets.top }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[styles.closeButton, { top: insets.top + spacing[2] }]}
          hitSlop={8}
        >
          <Text style={styles.closeIcon}>×</Text>
        </Pressable>
        <Image source={stationCover} style={styles.heroImage} resizeMode="contain" />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
  },
  heroGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    left: spacing[5],
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
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
  heroImage: {
    width: '72%',
    height: '78%',
  },
});
