import { Linking, Platform } from 'react-native';
import BackgroundService from 'react-native-background-actions';
import { formatDateTimeHms } from '../utils/datetime';
import { getSnapshot } from './waterAppService';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function keepAliveTask() {
  // Sticky FGS loop — keeps process eligible for Xiaomi “后台活动”
  // and lets JS timers / notification listeners stay more reliable.
  while (BackgroundService.isRunning()) {
    try {
      const snap = await getSnapshot();
      const next = snap.progress.nextReminderAt;
      const desc = next
        ? `下次 ${formatDateTimeHms(next)}`
        : '提醒服务运行中';
      await BackgroundService.updateNotification({
        taskDesc: desc,
      });
    } catch {
      // ignore transient db/notification errors in the loop
    }
    await sleep(20_000);
  }
}

export function isKeepAliveRunning(): boolean {
  if (Platform.OS !== 'android') return false;
  return BackgroundService.isRunning();
}

export async function startKeepAlive(forceRestart = false): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (BackgroundService.isRunning()) {
    if (!forceRestart) return;
    await BackgroundService.stop();
  }

  await BackgroundService.start(keepAliveTask, {
    taskName: 'TongFengWaterKeepAlive',
    taskTitle: '痛风喝水助手',
    taskDesc: '提醒服务运行中',
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap',
    },
    color: '#0B6E4F',
    linkingURI: 'tongfeng://home',
    foregroundServiceType: ['specialUse'],
    parameters: {
      delay: 20000,
    },
  });
}

export async function stopKeepAlive(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!BackgroundService.isRunning()) return;
  await BackgroundService.stop();
}

export async function syncKeepAliveWithSettings(
  notificationsEnabled: boolean,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (notificationsEnabled) {
    await startKeepAlive();
  } else {
    await stopKeepAlive();
  }
}

/** Open Xiaomi/Android battery optimization settings when possible. */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.sendIntent(
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    );
  } catch {
    try {
      await Linking.openSettings();
    } catch {
      // ignore
    }
  }
}
