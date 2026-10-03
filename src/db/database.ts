import * as SQLite from 'expo-sqlite';

const DB_NAME = 'tongfeng_v1.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function tableHasColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

/**
 * Local SQLite schema mirrors planned MySQL tables so sync can map 1:1 later.
 * All timestamps stored as ISO-8601 UTC strings.
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY NOT NULL,
      user_id INTEGER NOT NULL UNIQUE,
      daily_goal_ml INTEGER NOT NULL,
      wake_time TEXT NOT NULL,
      cutoff_time TEXT NOT NULL,
      quick_amounts_json TEXT NOT NULL,
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      repeat_interval_minutes INTEGER NOT NULL DEFAULT 15,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS water_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      drunk_at TEXT NOT NULL,
      amount_ml INTEGER NOT NULL,
      source TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_water_logs_user_drunk
      ON water_logs(user_id, drunk_at);

    CREATE TABLE IF NOT EXISTS reminder_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      fire_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT,
      notification_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reminder_jobs_user_status_fire
      ON reminder_jobs(user_id, status, fire_at);
  `);

  if (!(await tableHasColumn(db, 'user_settings', 'repeat_interval_minutes'))) {
    await db.execAsync(
      `ALTER TABLE user_settings ADD COLUMN repeat_interval_minutes INTEGER NOT NULL DEFAULT 15`,
    );
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

export function nowIso(): string {
  return new Date().toISOString();
}
