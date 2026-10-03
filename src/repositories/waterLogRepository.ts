import { getDatabase, nowIso } from '../db/database';
import { DEFAULT_USER_ID, WaterLog, WaterLogSource } from '../models/types';
import { endOfLocalDay, startOfLocalDay } from '../utils/datetime';

export interface CreateWaterLogInput {
  drunk_at: Date;
  amount_ml: number;
  source: WaterLogSource;
  note?: string | null;
}

export async function createWaterLog(input: CreateWaterLogInput): Promise<WaterLog> {
  const db = await getDatabase();
  const ts = nowIso();
  const result = await db.runAsync(
    `INSERT INTO water_logs (
      user_id, drunk_at, amount_ml, source, note, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      DEFAULT_USER_ID,
      input.drunk_at.toISOString(),
      input.amount_ml,
      input.source,
      input.note ?? null,
      ts,
      ts,
    ],
  );

  const row = await db.getFirstAsync<WaterLog>(
    'SELECT * FROM water_logs WHERE id = ?',
    [result.lastInsertRowId],
  );
  if (!row) throw new Error('Failed to create water log');
  return row;
}

export async function updateWaterLog(
  id: number,
  patch: Partial<{ drunk_at: Date; amount_ml: number; note: string | null }>,
): Promise<WaterLog> {
  const db = await getDatabase();
  const current = await db.getFirstAsync<WaterLog>(
    'SELECT * FROM water_logs WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  if (!current) throw new Error('Water log not found');

  await db.runAsync(
    `UPDATE water_logs SET
      drunk_at = ?,
      amount_ml = ?,
      note = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      (patch.drunk_at ?? new Date(current.drunk_at)).toISOString(),
      patch.amount_ml ?? current.amount_ml,
      patch.note !== undefined ? patch.note : current.note,
      nowIso(),
      id,
    ],
  );

  const row = await db.getFirstAsync<WaterLog>(
    'SELECT * FROM water_logs WHERE id = ?',
    [id],
  );
  if (!row) throw new Error('Water log missing after update');
  return row;
}

export async function softDeleteWaterLog(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE water_logs SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
    [nowIso(), nowIso(), id],
  );
}

export async function listWaterLogsForDay(day: Date = new Date()): Promise<WaterLog[]> {
  const db = await getDatabase();
  const from = startOfLocalDay(day).toISOString();
  const to = endOfLocalDay(day).toISOString();
  return db.getAllAsync<WaterLog>(
    `SELECT * FROM water_logs
     WHERE user_id = ?
       AND deleted_at IS NULL
       AND drunk_at >= ?
       AND drunk_at <= ?
     ORDER BY drunk_at DESC, id DESC`,
    [DEFAULT_USER_ID, from, to],
  );
}

export async function getWaterLogById(id: number): Promise<WaterLog | null> {
  const db = await getDatabase();
  return db.getFirstAsync<WaterLog>(
    'SELECT * FROM water_logs WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
}
