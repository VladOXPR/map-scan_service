import '../global.css';

// Must load so TaskManager.defineTask runs in global scope.
import '@/features/alerts/backgroundLowBatteryTask';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/store/authStore';
import { useLocationStore } from '@/store/locationStore';
import { colors } from '@/theme';
import { configureMapbox } from '@/lib/mapbox';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateLocation = useLocationStore((s) => s.hydrate);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const locationHydrated = useLocationStore((s) => s.hydrated);

  useEffect(() => {
    configureMapbox();
    void hydrateAuth();
    void hydrateLocation();
  }, [hydrateAuth, hydrateLocation]);

  useEffect(() => {
    if (authHydrated && locationHydrated) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [authHydrated, locationHydrated]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <QueryClientProvider client={queryClient}>
        <BottomSheetModalProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
        </BottomSheetModalProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
