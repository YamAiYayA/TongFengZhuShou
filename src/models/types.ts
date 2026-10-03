/** Domain types shaped for a future MySQL sync (snake_case column names mirrored). */

export type WaterLogSource = 'reminder' | 'manual';

export type ReminderKind = 'water' | 'first_cup';

export type ReminderStatus =
  | 'pending'
  | 'fired'
  | 'cancelled'
  | 'snoozed'
  | 'completed';

export interface UserSettings {
  id: number;
  user_id: number;
  daily_goal_ml: number;
  wake_time: string; // HH:mm
  cutoff_time: string; // HH:mm
  quick_amounts_json: string; // JSON number[]
  notifications_enabled: number; // 0 | 1
  /** Minutes between auto repeats when user ignores a reminder. */
  repeat_interval_minutes: number;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_REPEAT_INTERVAL_MINUTES = 15;

export interface WaterLog {
  id: number;
  user_id: number;
  drunk_at: string; // ISO datetime
  amount_ml: number;
  source: WaterLogSource;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ReminderJob {
  id: number;
  user_id: number;
  fire_at: string; // ISO datetime
  kind: ReminderKind;
  status: ReminderStatus;
  payload_json: string | null;
  notification_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ProgressStatus =
  | 'ahead'
  | 'on_track'
  | 'catch_up'
  | 'far_behind'
  | 'no_data'
  | 'after_cutoff';

export interface IntervalSuggestion {
  intervalMinutes: number;
  remainingCount: number;
  mlPerDrink: number;
}

export interface DayProgress {
  dateKey: string;
  goalMl: number;
  drunkMl: number;
  remainingMl: number;
  timeProgressPct: number;
  amountProgressPct: number;
  status: ProgressStatus;
  statusLabel: string;
  wakeAt: Date;
  cutoffAt: Date;
  firstDrinkAt: Date | null;
  minutesSinceLastDrink: number | null;
  intervals: IntervalSuggestion[];
  nextReminderAt: Date | null;
}

export const DEFAULT_USER_ID = 1;

export const DEFAULT_QUICK_AMOUNTS = [100, 150, 200, 250, 300];

export const INTERVAL_OPTIONS = [5, 10, 15, 20, 30] as const;

export const SNOOZE_OPTIONS = [5, 10, 15, 30, 60] as const;

export const NEXT_REMIND_OPTIONS = [5, 10, 15, 20, 30, 60] as const;

export const AGO_OPTIONS = [
  { label: '刚喝', minutes: 0 },
  { label: '5分钟前', minutes: 5 },
  { label: '10分钟前', minutes: 10 },
  { label: '15分钟前', minutes: 15 },
  { label: '30分钟前', minutes: 30 },
] as const;
