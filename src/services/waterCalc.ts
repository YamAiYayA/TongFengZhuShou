import {
  DayProgress,
  INTERVAL_OPTIONS,
  IntervalSuggestion,
  ProgressStatus,
  UserSettings,
  WaterLog,
} from '../models/types';
import {
  clamp,
  combineDateAndTime,
  dateKeyLocal,
  minutesBetween,
} from '../utils/datetime';

export function sumDrunkMl(logs: WaterLog[]): number {
  return logs.reduce((sum, log) => sum + log.amount_ml, 0);
}

export function getFirstDrinkAt(logs: WaterLog[]): Date | null {
  if (logs.length === 0) return null;
  const sorted = [...logs].sort(
    (a, b) => new Date(a.drunk_at).getTime() - new Date(b.drunk_at).getTime(),
  );
  return new Date(sorted[0].drunk_at);
}

export function getLastDrinkAt(logs: WaterLog[]): Date | null {
  if (logs.length === 0) return null;
  const sorted = [...logs].sort(
    (a, b) => new Date(b.drunk_at).getTime() - new Date(a.drunk_at).getTime(),
  );
  return new Date(sorted[0].drunk_at);
}

export function buildIntervalSuggestions(
  remainingMl: number,
  remainingMinutes: number,
): IntervalSuggestion[] {
  if (remainingMl <= 0 || remainingMinutes <= 0) {
    return INTERVAL_OPTIONS.map((intervalMinutes) => ({
      intervalMinutes,
      remainingCount: 0,
      mlPerDrink: 0,
    }));
  }

  return INTERVAL_OPTIONS.map((intervalMinutes) => {
    const remainingCount = Math.max(1, Math.floor(remainingMinutes / intervalMinutes));
    const mlPerDrink = Math.ceil(remainingMl / remainingCount);
    return { intervalMinutes, remainingCount, mlPerDrink };
  });
}

function resolveStatus(
  amountPct: number,
  timePct: number,
  now: Date,
  wakeAt: Date,
  cutoffAt: Date,
  hasLogs: boolean,
): { status: ProgressStatus; statusLabel: string } {
  if (now > cutoffAt) {
    return {
      status: 'after_cutoff',
      statusLabel: amountPct >= 100 ? '今日已结束 · 达标' : '今日已结束 · 未达标',
    };
  }
  if (now < wakeAt && !hasLogs) {
    return { status: 'no_data', statusLabel: '尚未到起床时间' };
  }
  if (!hasLogs) {
    return { status: 'no_data', statusLabel: '今天第一杯还未记录' };
  }

  const diff = amountPct - timePct;
  if (diff >= 15) return { status: 'ahead', statusLabel: '超前达成' };
  if (diff >= -10) return { status: 'on_track', statusLabel: '勉强达成' };
  if (diff >= -25) return { status: 'catch_up', statusLabel: '还需追赶' };
  return { status: 'far_behind', statusLabel: '差得远了' };
}

export function computeDayProgress(input: {
  settings: UserSettings;
  logs: WaterLog[];
  now?: Date;
  nextReminderAt?: Date | null;
}): DayProgress {
  const now = input.now ?? new Date();
  const wakeAt = combineDateAndTime(now, input.settings.wake_time);
  const cutoffAt = combineDateAndTime(now, input.settings.cutoff_time);
  const goalMl = input.settings.daily_goal_ml;
  const drunkMl = sumDrunkMl(input.logs);
  const remainingMl = Math.max(0, goalMl - drunkMl);
  const firstDrinkAt = getFirstDrinkAt(input.logs);
  const lastDrinkAt = getLastDrinkAt(input.logs);

  const totalWindowMinutes = Math.max(1, minutesBetween(wakeAt, cutoffAt));
  let elapsedMinutes = 0;
  if (now <= wakeAt) elapsedMinutes = 0;
  else if (now >= cutoffAt) elapsedMinutes = totalWindowMinutes;
  else elapsedMinutes = minutesBetween(wakeAt, now);

  const timeProgressPct = clamp((elapsedMinutes / totalWindowMinutes) * 100, 0, 100);
  const amountProgressPct = clamp((drunkMl / Math.max(1, goalMl)) * 100, 0, 999);

  const remainingMinutes =
    now >= cutoffAt ? 0 : Math.max(0, minutesBetween(now, cutoffAt));

  const { status, statusLabel } = resolveStatus(
    amountProgressPct,
    timeProgressPct,
    now,
    wakeAt,
    cutoffAt,
    input.logs.length > 0,
  );

  return {
    dateKey: dateKeyLocal(now),
    goalMl,
    drunkMl,
    remainingMl,
    timeProgressPct: Math.round(timeProgressPct),
    amountProgressPct: Math.round(amountProgressPct),
    status,
    statusLabel,
    wakeAt,
    cutoffAt,
    firstDrinkAt,
    minutesSinceLastDrink: lastDrinkAt
      ? minutesBetween(lastDrinkAt, now)
      : null,
    intervals: buildIntervalSuggestions(remainingMl, remainingMinutes),
    nextReminderAt: input.nextReminderAt ?? null,
  };
}
