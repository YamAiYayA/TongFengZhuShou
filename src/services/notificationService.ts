import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ANDROID_CHANNEL_ID = 'water-reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice && Platform.OS !== 'android') {
    // Emulators still useful for UI testing; allow scheduling on Android emulator.
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: '喝水提醒',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#0B6E4F',
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return (
    requested.granted ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function cancelScheduledNotification(
  notificationId: string | null | undefined,
): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // ignore missing ids
  }
}

export async function cancelAllWaterNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleWaterNotification(input: {
  fireAt: Date;
  remainingMl: number;
  kind: 'water' | 'first_cup';
  reminderJobId: number;
}): Promise<string | null> {
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return null;

  const now = Date.now();
  let fireAt = input.fireAt;
  if (fireAt.getTime() <= now + 1500) {
    fireAt = new Date(now + 2000);
  }

  const title = input.kind === 'first_cup' ? '该喝第一杯水了' : '该喝水了';
  const body =
    input.kind === 'first_cup'
      ? `今日第一杯还未记录，余量 ${input.remainingMl} ml`
      : `今日余量 ${input.remainingMl} ml`;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        kind: input.kind,
        reminderJobId: input.reminderJobId,
        remainingMl: input.remainingMl,
      },
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
    },
  });

  return id;
}
