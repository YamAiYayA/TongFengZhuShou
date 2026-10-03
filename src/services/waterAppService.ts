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
  listRemindersByStatus,
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
import { addMinutes, addSeconds, combineDateAndTime } from '../utils/datetime';
import { computeDayProgress } from './waterCalc';
import { buildDayCurves } from './waterCurve';
import {
  cancelAllWaterNotifications,
  cancelScheduledNotification,
  ensureNotificationPermissions,
  presentWaterNotificationNow,
  scheduleWaterNotification,
} from './notificationService';

/** actual - planned; positive means ahead of pace. */
function paceDeltaMl(settings: UserSettings, logs: WaterLog[]): number {
  const curves = buildDayCurves({ settings, logs });
  return Math.round(curves.actualNowMl - curves.plannedNowMl);
}

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

async function scheduleSingleReminder(input: {
  fireAt: Date;
  kind: 'water' | 'first_cup';
  remainingMl: number;
  paceDeltaMl: number;
}): Promise<ReminderJob | null> {
  const job = await createReminderJob({
    fire_at: input.fireAt,
    kind: input.kind,
    payload: {
      remainingMl: input.remainingMl,
      paceDeltaMl: input.paceDeltaMl,
    },
  });

  const scheduled = await scheduleWaterNotification({
    fireAt: input.fireAt,
    remainingMl: input.remainingMl,
    paceDeltaMl: input.paceDeltaMl,
    kind: input.kind,
    reminderJobId: job.id,
  });

  // Keep DB fire_at aligned with the time actually scheduled for the OS.
  await updateReminderJob(job.id, {
    notification_id: scheduled.notificationId,
    fire_at: scheduled.fireAt,
  });

  return (await getReminderById(job.id)) ?? job;
}

/**
 * Schedule exactly one next reminder.
 * When it is due and ignored, `advanceDueReminders` schedules the next repeat.
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
  const repeatMinutes = Math.max(1, settings.repeat_interval_minutes);

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
      fireAt = addMinutes(now, repeatMinutes);
      kind = 'water';
    }
  }

  if (fireAt.getTime() <= now.getTime()) {
    fireAt = addSeconds(now, 2);
  }

  if (fireAt > cutoffAt) {
    return null;
  }

  return scheduleSingleReminder({
    fireAt,
    kind,
    remainingMl: progress.remainingMl,
    paceDeltaMl: paceDeltaMl(settings, logs),
  });
}

/**
 * Mark overdue pending reminders as fired, show a notification if any were due,
 * and schedule the next repeat if nothing future is pending.
 */
export async function advanceDueReminders(options?: {
  presentNotification?: boolean;
}): Promise<AppSnapshot> {
  const presentNotification = options?.presentNotification ?? true;
  const settings = await getSettings();
  const logs = await listWaterLogsForDay();
  const now = new Date();
  const cutoffAt = combineDateAndTime(now, settings.cutoff_time);
  const progress = computeDayProgress({ settings, logs, now });
  const repeatMinutes = Math.max(1, settings.repeat_interval_minutes);

  const pending = await listRemindersByStatus(['pending']);
  const due = pending.filter((job) => new Date(job.fire_at).getTime() <= now.getTime());

  let lastDue: ReminderJob | null = null;
  for (const job of due) {
    await cancelScheduledNotification(job.notification_id);
    await updateReminderJob(job.id, { status: 'fired' });
    lastDue = job;
  }

  if (
    presentNotification &&
    lastDue &&
    settings.notifications_enabled &&
    now < cutoffAt
  ) {
    await presentWaterNotificationNow({
      remainingMl: progress.remainingMl,
      paceDeltaMl: paceDeltaMl(settings, logs),
      kind: lastDue.kind === 'first_cup' ? 'first_cup' : 'water',
      reminderJobId: lastDue.id,
    });
  }

  const next = await getNextPendingReminder();
  const nextIsFuture =
    next != null && new Date(next.fire_at).getTime() > now.getTime();

  if (!nextIsFuture && settings.notifications_enabled && now < cutoffAt) {
    // Ignored / overdue: schedule the next repeat from now.
    await scheduleNextReminder({
      nextFireAt: addMinutes(now, repeatMinutes),
      kind: 'water',
    });
  }

  return getSnapshot();
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
  await advanceDueReminders({ presentNotification: false });
  const current = await getNextPendingReminder();
  const nextFireAt = current ? new Date(current.fire_at) : null;
  if (nextFireAt && nextFireAt.getTime() > Date.now()) {
    await scheduleNextReminder({
      nextFireAt,
      kind: current?.kind === 'first_cup' ? 'first_cup' : 'water',
    });
  } else {
    await scheduleNextReminder();
  }
  return getSnapshot();
}

export async function recordDrink(input: {
  amountMl: number;
  minutesAgo?: number;
  source: 'reminder' | 'manual';
  nextRemindInSeconds?: number | null;
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

  // Clear any leftover pending chain/items after user acted.
  const pending = await cancelPendingReminders();
  await cancelJobsAndNotifications(pending);

  const settings = await getSettings();
  const nextSeconds =
    input.nextRemindInSeconds != null
      ? input.nextRemindInSeconds
      : input.nextRemindInMinutes != null
        ? input.nextRemindInMinutes * 60
        : settings.repeat_interval_minutes * 60;

  if (nextSeconds > 0) {
    await scheduleNextReminder({
      nextFireAt: addSeconds(new Date(), nextSeconds),
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
  const pending = await cancelPendingReminders();
  await cancelJobsAndNotifications(pending);
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
  const next = await getNextPendingReminder();
  await scheduleNextReminder(
    next
      ? {
          nextFireAt: new Date(next.fire_at),
          kind: next.kind === 'first_cup' ? 'water' : next.kind,
        }
      : undefined,
  );
  return getSnapshot();
}

export async function bootstrapApp(): Promise<AppSnapshot> {
  await ensureNotificationPermissions();
  // Catch anything already due (e.g. app was killed), then ensure a next exists.
  await advanceDueReminders({ presentNotification: false });
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

/**
 * Notification delivered or tapped: mark fired and ensure the next repeat exists
 * if the user has not acted yet.
 */
export async function onReminderNotificationDelivered(
  reminderJobId?: number,
): Promise<AppSnapshot> {
  if (reminderJobId) {
    const job = await getReminderById(reminderJobId);
    if (job && job.status === 'pending') {
      await updateReminderJob(reminderJobId, { status: 'fired' });
      await cancelScheduledNotification(job.notification_id);
    }
  }

  const settings = await getSettings();
  const now = new Date();
  const cutoffAt = combineDateAndTime(now, settings.cutoff_time);
  const next = await getNextPendingReminder();
  const nextIsFuture =
    next != null && new Date(next.fire_at).getTime() > now.getTime();

  if (!nextIsFuture && settings.notifications_enabled && now < cutoffAt) {
    await scheduleNextReminder({
      nextFireAt: addMinutes(now, Math.max(1, settings.repeat_interval_minutes)),
      kind: 'water',
    });
  }

  return getSnapshot();
}
