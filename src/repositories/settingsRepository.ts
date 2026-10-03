import { getDatabase, nowIso } from '../db/database';
import {
  DEFAULT_QUICK_AMOUNTS,
  DEFAULT_REPEAT_INTERVAL_MINUTES,
  DEFAULT_USER_ID,
  UserSettings,
} from '../models/types';

export type SettingsUpdate = Partial<{
  daily_goal_ml: number;
  wake_time: string;
  cutoff_time: string;
  quick_amounts_json: string;
  notifications_enabled: number;
  repeat_interval_minutes: number;
}>;

function normalizeSettings(row: UserSettings): UserSettings {
  return {
    ...row,
    repeat_interval_minutes:
      row.repeat_interval_minutes > 0
        ? row.repeat_interval_minutes
        : DEFAULT_REPEAT_INTERVAL_MINUTES,
  };
}

async function ensureDefaults(): Promise<UserSettings> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<UserSettings>(
    'SELECT * FROM user_settings WHERE user_id = ?',
    [DEFAULT_USER_ID],
  );
  if (existing) return normalizeSettings(existing);

  const ts = nowIso();
  await db.runAsync(
    `INSERT INTO user_settings (
      id, user_id, daily_goal_ml, wake_time, cutoff_time,
      quick_amounts_json, notifications_enabled, repeat_interval_minutes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      1,
      DEFAULT_USER_ID,
      2500,
      '07:00',
      '21:00',
      JSON.stringify(DEFAULT_QUICK_AMOUNTS),
      1,
      DEFAULT_REPEAT_INTERVAL_MINUTES,
      ts,
      ts,
    ],
  );

  const created = await db.getFirstAsync<UserSettings>(
    'SELECT * FROM user_settings WHERE user_id = ?',
    [DEFAULT_USER_ID],
  );
  if (!created) throw new Error('Failed to create default settings');
  return normalizeSettings(created);
}

export async function getSettings(): Promise<UserSettings> {
  return ensureDefaults();
}

export async function updateSettings(patch: SettingsUpdate): Promise<UserSettings> {
  const current = await ensureDefaults();
  const next = {
    daily_goal_ml: patch.daily_goal_ml ?? current.daily_goal_ml,
    wake_time: patch.wake_time ?? current.wake_time,
    cutoff_time: patch.cutoff_time ?? current.cutoff_time,
    quick_amounts_json: patch.quick_amounts_json ?? current.quick_amounts_json,
    notifications_enabled:
      patch.notifications_enabled ?? current.notifications_enabled,
    repeat_interval_minutes:
      patch.repeat_interval_minutes ?? current.repeat_interval_minutes,
  };

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE user_settings SET
      daily_goal_ml = ?,
      wake_time = ?,
      cutoff_time = ?,
      quick_amounts_json = ?,
      notifications_enabled = ?,
      repeat_interval_minutes = ?,
      updated_at = ?
     WHERE user_id = ?`,
    [
      next.daily_goal_ml,
      next.wake_time,
      next.cutoff_time,
      next.quick_amounts_json,
      next.notifications_enabled,
      next.repeat_interval_minutes,
      nowIso(),
      DEFAULT_USER_ID,
    ],
  );

  return getSettings();
}

export function parseQuickAmounts(settings: UserSettings): number[] {
  try {
    const arr = JSON.parse(settings.quick_amounts_json);
    if (Array.isArray(arr) && arr.every((x) => typeof x === 'number')) {
      return arr.filter((x) => x > 0);
    }
  } catch {
    // fall through
  }
  return [...DEFAULT_QUICK_AMOUNTS];
}
