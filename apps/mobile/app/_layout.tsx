import '../global.css';

// Must load so TaskManager.defineTask runs in global scope.
import '@/features/alerts/backgroundLowBatteryTask';

import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { EmptyState } from '@/components/ui';
import { useAnalyticsLifecycle } from '@/features/analytics/useAnalyticsLifecycle';
import { BillingProvider } from '@/features/billing/stripe';
import { tracker } from '@/lib/analytics';
import { useAuthStore } from '@/store/authStore';
import { useLocationStore } from '@/store/locationStore';
import { useAccountPromptStore } from '@/store/accountPromptStore';
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

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    tracker.error(error, { fatal: false, source: 'error_boundary' });
  }, [error]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <EmptyState
        title="Something went wrong"
        description="Try again. If it keeps happening, contact CUUB support."
        actionLabel="Try again"
        onAction={() => {
          void retry();
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  useAnalyticsLifecycle();
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateLocation = useLocationStore((s) => s.hydrate);
  const hydrateAccountPrompt = useAccountPromptStore((s) => s.hydrate);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const locationHydrated = useLocationStore((s) => s.hydrated);

  useEffect(() => {
    configureMapbox();
    void hydrateAuth();
    void hydrateLocation();
    void hydrateAccountPrompt();
  }, [hydrateAuth, hydrateLocation, hydrateAccountPrompt]);

  useEffect(() => {
    if (authHydrated && locationHydrated) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [authHydrated, locationHydrated]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <QueryClientProvider client={queryClient}>
        <BillingProvider>
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
        </BillingProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
