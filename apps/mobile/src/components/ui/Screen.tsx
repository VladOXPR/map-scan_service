import { View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';

type ScreenProps = ViewProps & {
  edges?: Array<'top' | 'right' | 'bottom' | 'left'>;
  padded?: boolean;
};

export function Screen({
  children,
  style,
  edges = ['top', 'bottom'],
  padded = false,
  ...rest
}: ScreenProps) {
  return (
    <SafeAreaView
      edges={edges}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <View
        style={[
          { flex: 1, backgroundColor: colors.bg },
          padded ? { paddingHorizontal: 20 } : null,
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}
