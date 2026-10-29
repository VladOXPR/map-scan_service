import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { registerLowBatteryBackgroundTask } from '@/features/alerts/backgroundLowBatteryTask';
import { syncExpoPushToken } from '@/features/alerts/registerExpoPushToken';
import { useLowBatteryAlerts } from '@/features/alerts/useLowBatteryAlerts';
import { usePushNavigation } from '@/features/alerts/usePushNavigation';
import { useBilling } from '@/features/billing/hooks';
import { useAuthStore } from '@/store/authStore';
import { LoadingState } from '@/components/ui';
import { colors } from '@/theme';

export default function AppLayout() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);

  useLowBatteryAlerts(Boolean(hydrated && session));
  // Keeps the analytics membership context current on every screen.
  useBilling();
  usePushNavigation();

  useEffect(() => {
    if (!hydrated || !session?.token) return;
    void registerLowBatteryBackgroundTask();
    void syncExpoPushToken(session.token).catch((error) => {
      console.warn('[push] token sync failed', error);
    });
  }, [hydrated, session?.token]);

  if (!hydrated) {
    return <LoadingState />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="s/[code]" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen
        name="scan"
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="membership"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack>
  );
}
