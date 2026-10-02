import {
  DayProgress,
  ReminderJob,
  UserSettings,
  WaterLog,
} from '../models/types';
import {
  cancelPendingReminders,
  createReminderJob,
  getNextPendingReminder,
  getReminderById,
  updateReminderJob,
} from '../repositories/reminderRepository';
import {
  getSettings,
  parseQuickAmounts,
  SettingsUpdate,
  updateSettings,
} from '../repositories/settingsRepository';
import {
  createWaterLog,
  listWaterLogsForDay,
  softDeleteWaterLog,
  updateWaterLog,
} from '../repositories/waterLogRepository';
import { addMinutes, combineDateAndTime } from '../utils/datetime';
import { computeDayProgress } from './waterCalc';
import {
  cancelAllWaterNotifications,
  cancelScheduledNotification,
  ensureNotificationPermissions,
  scheduleWaterNotification,
} from './notificationService';

export interface AppSnapshot {
  settings: UserSettings;
  quickAmounts: number[];
  logs: WaterLog[];
  progress: DayProgress;
  nextReminder: ReminderJob | null;
}

async function cancelJobsAndNotifications(jobs: ReminderJob[]): Promise<void> {
  for (const job of jobs) {
    await cancelScheduledNotification(job.notification_id);
  }
}

/**
 * Rebuilds the next local notification from current progress.
 * - Before first drink and after wake: first_cup reminder at wake (or soon).
 * - After drinks: only schedules when caller provides nextFireAt.
 * - After cutoff: no "未达标" nagging.
 */
export async function scheduleNextReminder(options?: {
  nextFireAt?: Date | null;
  kind?: 'water' | 'first_cup';
}): Promise<ReminderJob | null> {
  const settings = await getSettings();
  const logs = await listWaterLogsForDay();
  const now = new Date();
  const wakeAt = combineDateAndTime(now, settings.wake_time);
  const cutoffAt = combineDateAndTime(now, settings.cutoff_time);
  const progress = computeDayProgress({ settings, logs, now });

  const previous = await cancelPendingReminders();
  await cancelJobsAndNotifications(previous);

  if (!settings.notifications_enabled) {
    await cancelAllWaterNotifications();
    return null;
  }

  if (now >= cutoffAt) {
    return null;
  }

  let fireAt = options?.nextFireAt ?? null;
  let kind: 'water' | 'first_cup' = options?.kind ?? 'water';

  if (!fireAt) {
    if (logs.length === 0) {
      fireAt = now < wakeAt ? wakeAt : addMinutes(now, 1);
      kind = 'first_cup';
    } else {
      return null;
    }
  }

  if (fireAt > cutoffAt) {
    return null;
  }

  const job = await createReminderJob({
    fire_at: fireAt,
    kind,
    payload: { remainingMl: progress.remainingMl },
  });

  const notificationId = await scheduleWaterNotification({
    fireAt,
    remainingMl: progress.remainingMl,
    kind,
    reminderJobId: job.id,
  });

  await updateReminderJob(job.id, { notification_id: notificationId });
  return (await getReminderById(job.id)) ?? job;
}

export async function getSnapshot(): Promise<AppSnapshot> {
  const settings = await getSettings();
  const logs = await listWaterLogsForDay();
  const nextReminder = await getNextPendingReminder();
  const progress = computeDayProgress({
    settings,
    logs,
    nextReminderAt: nextReminder ? new Date(nextReminder.fire_at) : null,
  });

  return {
    settings,
    quickAmounts: parseQuickAmounts(settings),
    logs,
    progress,
    nextReminder,
  };
}

export async function saveSettingsAndReschedule(
  patch: SettingsUpdate,
): Promise<AppSnapshot> {
  await updateSettings(patch);
  const current = await getNextPendingReminder();
  const nextFireAt =
    current && current.kind === 'water' ? new Date(current.fire_at) : null;
  await scheduleNextReminder(
    nextFireAt ? { nextFireAt, kind: 'water' } : undefined,
  );
  return getSnapshot();
}

export async function recordDrink(input: {
  amountMl: number;
  minutesAgo?: number;
  source: 'reminder' | 'manual';
  nextRemindInMinutes?: number | null;
  reminderJobId?: number | null;
}): Promise<AppSnapshot> {
  if (input.amountMl <= 0) {
    throw new Error('喝水量必须大于 0');
  }

  const drunkAt = addMinutes(new Date(), -(input.minutesAgo ?? 0));
  await createWaterLog({
    drunk_at: drunkAt,
    amount_ml: Math.round(input.amountMl),
    source: input.source,
  });

  if (input.reminderJobId) {
    await updateReminderJob(input.reminderJobId, { status: 'completed' });
  }

  if (input.nextRemindInMinutes != null && input.nextRemindInMinutes > 0) {
    await scheduleNextReminder({
      nextFireAt: addMinutes(new Date(), input.nextRemindInMinutes),
      kind: 'water',
    });
  } else {
    await scheduleNextReminder();
  }

  return getSnapshot();
}

export async function snoozeReminder(input: {
  minutes: number;
  reminderJobId?: number | null;
}): Promise<AppSnapshot> {
  if (input.reminderJobId) {
    await updateReminderJob(input.reminderJobId, { status: 'snoozed' });
  }
  await scheduleNextReminder({
    nextFireAt: addMinutes(new Date(), input.minutes),
    kind: 'water',
  });
  return getSnapshot();
}

export async function editDrink(
  id: number,
  patch: { amountMl?: number; minutesAgo?: number },
): Promise<AppSnapshot> {
  await updateWaterLog(id, {
    amount_ml: patch.amountMl,
    drunk_at:
      patch.minutesAgo != null
        ? addMinutes(new Date(), -patch.minutesAgo)
        : undefined,
  });
  const next = await getNextPendingReminder();
  await scheduleNextReminder(
    next ? { nextFireAt: new Date(next.fire_at), kind: next.kind } : undefined,
  );
  return getSnapshot();
}

export async function deleteDrink(id: number): Promise<AppSnapshot> {
  await softDeleteWaterLog(id);
  const logs = await listWaterLogsForDay();
  const next = await getNextPendingReminder();
  if (logs.length === 0) {
    await scheduleNextReminder();
  } else if (next) {
    await scheduleNextReminder({
      nextFireAt: new Date(next.fire_at),
      kind: next.kind === 'first_cup' ? 'water' : next.kind,
    });
  } else {
    await scheduleNextReminder();
  }
  return getSnapshot();
}

export async function bootstrapApp(): Promise<AppSnapshot> {
  await ensureNotificationPermissions();
  const snap = await getSnapshot();
  if (!snap.nextReminder) {
    await scheduleNextReminder();
    return getSnapshot();
  }
  return snap;
}

export async function markReminderFired(reminderJobId: number): Promise<void> {
  await updateReminderJob(reminderJobId, { status: 'fired' });
}
