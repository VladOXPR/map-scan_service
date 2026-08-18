import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';
import { registerLowBatteryBackgroundTask } from '@/features/alerts/backgroundLowBatteryTask';
import { syncExpoPushToken } from '@/features/alerts/registerExpoPushToken';
import { useLowBatteryAlerts } from '@/features/alerts/useLowBatteryAlerts';
import { useAuthStore } from '@/store/authStore';
import { LoadingState } from '@/components/ui';
import { colors } from '@/theme';

export default function AppLayout() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);

  useLowBatteryAlerts(Boolean(hydrated && session));

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

  if (!session) {
    return <Redirect href="/(auth)/phone" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'fade',
      }}
    />
  );
}
