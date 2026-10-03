import { UserSettings, WaterLog } from '../models/types';
import { combineDateAndTime } from '../utils/datetime';

export interface CurvePoint {
  /** 0..1 across wake→cutoff */
  t: number;
  /** ml cumulative */
  ml: number;
  at: Date;
}

export interface DayCurves {
  wakeAt: Date;
  cutoffAt: Date;
  goalMl: number;
  planned: CurvePoint[];
  actual: CurvePoint[];
  /** planned ml at "now" (clamped to window) */
  plannedNowMl: number;
  actualNowMl: number;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function buildDayCurves(input: {
  settings: UserSettings;
  logs: WaterLog[];
  now?: Date;
  plannedSteps?: number;
}): DayCurves {
  const now = input.now ?? new Date();
  const wakeAt = combineDateAndTime(now, input.settings.wake_time);
  const cutoffAt = combineDateAndTime(now, input.settings.cutoff_time);
  const goalMl = input.settings.daily_goal_ml;
  const windowMs = Math.max(1, cutoffAt.getTime() - wakeAt.getTime());
  const steps = input.plannedSteps ?? 48;

  const planned: CurvePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const at = new Date(wakeAt.getTime() + windowMs * t);
    planned.push({ t, ml: goalMl * t, at });
  }

  const sorted = [...input.logs].sort(
    (a, b) => new Date(a.drunk_at).getTime() - new Date(b.drunk_at).getTime(),
  );

  const actual: CurvePoint[] = [{ t: 0, ml: 0, at: wakeAt }];
  let cum = 0;
  for (const log of sorted) {
    const at = new Date(log.drunk_at);
    const t = clamp01((at.getTime() - wakeAt.getTime()) / windowMs);
    cum += log.amount_ml;
    actual.push({ t, ml: cum, at });
  }
  // Extend flat to "now" or end for readability
  const nowT = clamp01((now.getTime() - wakeAt.getTime()) / windowMs);
  if (actual[actual.length - 1].t < nowT) {
    actual.push({ t: nowT, ml: cum, at: now });
  }

  const plannedNowMl = goalMl * nowT;
  return {
    wakeAt,
    cutoffAt,
    goalMl,
    planned,
    actual,
    plannedNowMl,
    actualNowMl: cum,
  };
}
