import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { maybeNotifyLowBattery } from './lowBatteryNotifications';

/**
 * Background wakeups improve reliability while the app is suspended/backgrounded.
 * iOS will NOT run this after the user force-quits the app.
 */
export const LOW_BATTERY_BACKGROUND_TASK = 'cuub-low-battery-background';

TaskManager.defineTask(LOW_BATTERY_BACKGROUND_TASK, async () => {
  try {
    await maybeNotifyLowBattery();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn('[low-battery] background task failed', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerLowBatteryBackgroundTask(): Promise<void> {
  if (Platform.OS === 'web') return;

  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
    return;
  }

  const already = await TaskManager.isTaskRegisteredAsync(
    LOW_BATTERY_BACKGROUND_TASK,
  );
  if (already) return;

  // OS treats this as a minimum; iOS often runs less often.
  await BackgroundTask.registerTaskAsync(LOW_BATTERY_BACKGROUND_TASK, {
    minimumInterval: 15,
  });
}

export async function unregisterLowBatteryBackgroundTask(): Promise<void> {
  if (Platform.OS === 'web') return;
  const already = await TaskManager.isTaskRegisteredAsync(
    LOW_BATTERY_BACKGROUND_TASK,
  );
  if (!already) return;
  await BackgroundTask.unregisterTaskAsync(LOW_BATTERY_BACKGROUND_TASK);
}
