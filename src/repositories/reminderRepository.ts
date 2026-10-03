import { getDatabase, nowIso } from '../db/database';
import {
  DEFAULT_USER_ID,
  ReminderJob,
  ReminderKind,
  ReminderStatus,
} from '../models/types';

export async function cancelPendingReminders(
  kinds?: ReminderKind[],
): Promise<ReminderJob[]> {
  const db = await getDatabase();
  const pending = await listRemindersByStatus(['pending']);
  const targets = kinds
    ? pending.filter((r) => kinds.includes(r.kind))
    : pending;

  for (const job of targets) {
    await db.runAsync(
      `UPDATE reminder_jobs SET status = ?, updated_at = ? WHERE id = ?`,
      ['cancelled', nowIso(), job.id],
    );
  }
  return targets;
}

export async function createReminderJob(input: {
  fire_at: Date;
  kind: ReminderKind;
  payload?: Record<string, unknown> | null;
  notification_id?: string | null;
}): Promise<ReminderJob> {
  const db = await getDatabase();
  const ts = nowIso();
  const result = await db.runAsync(
    `INSERT INTO reminder_jobs (
      user_id, fire_at, kind, status, payload_json, notification_id, created_at, updated_at
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      DEFAULT_USER_ID,
      input.fire_at.toISOString(),
      input.kind,
      input.payload ? JSON.stringify(input.payload) : null,
      input.notification_id ?? null,
      ts,
      ts,
    ],
  );

  const row = await db.getFirstAsync<ReminderJob>(
    'SELECT * FROM reminder_jobs WHERE id = ?',
    [result.lastInsertRowId],
  );
  if (!row) throw new Error('Failed to create reminder job');
  return row;
}

export async function updateReminderJob(
  id: number,
  patch: Partial<{
    status: ReminderStatus;
    fire_at: Date;
    notification_id: string | null;
    payload_json: string | null;
  }>,
): Promise<void> {
  const db = await getDatabase();
  const current = await db.getFirstAsync<ReminderJob>(
    'SELECT * FROM reminder_jobs WHERE id = ?',
    [id],
  );
  if (!current) return;

  await db.runAsync(
    `UPDATE reminder_jobs SET
      status = ?,
      fire_at = ?,
      notification_id = ?,
      payload_json = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      patch.status ?? current.status,
      (patch.fire_at ?? new Date(current.fire_at)).toISOString(),
      patch.notification_id !== undefined
        ? patch.notification_id
        : current.notification_id,
      patch.payload_json !== undefined
        ? patch.payload_json
        : current.payload_json,
      nowIso(),
      id,
    ],
  );
}

export async function listRemindersByStatus(
  statuses: ReminderStatus[],
): Promise<ReminderJob[]> {
  const db = await getDatabase();
  if (statuses.length === 0) return [];
  const placeholders = statuses.map(() => '?').join(',');
  return db.getAllAsync<ReminderJob>(
    `SELECT * FROM reminder_jobs
     WHERE user_id = ? AND status IN (${placeholders})
     ORDER BY fire_at ASC`,
    [DEFAULT_USER_ID, ...statuses],
  );
}

export async function getNextPendingReminder(): Promise<ReminderJob | null> {
  const db = await getDatabase();
  return db.getFirstAsync<ReminderJob>(
    `SELECT * FROM reminder_jobs
     WHERE user_id = ? AND status = 'pending'
     ORDER BY fire_at ASC
     LIMIT 1`,
    [DEFAULT_USER_ID],
  );
}

export async function getReminderById(id: number): Promise<ReminderJob | null> {
  const db = await getDatabase();
  return db.getFirstAsync<ReminderJob>(
    'SELECT * FROM reminder_jobs WHERE id = ?',
    [id],
  );
}
