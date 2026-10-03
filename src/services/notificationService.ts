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
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: '喝水提醒',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#0B6E4F',
      sound: 'default',
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
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

function buildContent(input: {
  remainingMl: number;
  kind: 'water' | 'first_cup';
  reminderJobId: number;
}) {
  const title = input.kind === 'first_cup' ? '该喝第一杯水了' : '该喝水了';
  const body =
    input.kind === 'first_cup'
      ? `今日第一杯还未记录，余量 ${input.remainingMl} ml`
      : `今日余量 ${input.remainingMl} ml`;

  return {
    title,
    body,
    data: {
      kind: input.kind,
      reminderJobId: input.reminderJobId,
      remainingMl: input.remainingMl,
    },
    sound: true as const,
    ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
  };
}

/** Show a notification right now (for due reminders while app is open / advancing). */
export async function presentWaterNotificationNow(input: {
  remainingMl: number;
  kind: 'water' | 'first_cup';
  reminderJobId: number;
}): Promise<string | null> {
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return null;

  return Notifications.scheduleNotificationAsync({
    content: buildContent(input),
    trigger: null,
  });
}

/**
 * Schedule a future water reminder.
 * Returns the actual fire time used (may be bumped a couple seconds if too soon)
 * and the notification id.
 */
export async function scheduleWaterNotification(input: {
  fireAt: Date;
  remainingMl: number;
  kind: 'water' | 'first_cup';
  reminderJobId: number;
}): Promise<{ notificationId: string | null; fireAt: Date }> {
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return { notificationId: null, fireAt: input.fireAt };

  const now = Date.now();
  let fireAt = input.fireAt;
  if (fireAt.getTime() <= now + 1500) {
    fireAt = new Date(now + 2000);
  }

  const secondsUntil = Math.max(
    1,
    Math.ceil((fireAt.getTime() - Date.now()) / 1000),
  );

  // Prefer TIME_INTERVAL for nearer reminders — more reliable on some OEMs.
  const useInterval = secondsUntil <= 3600;

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: buildContent({
      remainingMl: input.remainingMl,
      kind: input.kind,
      reminderJobId: input.reminderJobId,
    }),
    trigger: useInterval
      ? {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsUntil,
          channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
        }
      : {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
          channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
        },
  });

  return { notificationId, fireAt };
}
