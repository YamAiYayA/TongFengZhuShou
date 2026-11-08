<?php
function db(): PDO {
  static $pdo = null;
  if ($pdo instanceof PDO) return $pdo;
  $cfg = require __DIR__ . '/config.php';
  $dsn = sprintf(
    'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
    $cfg['db_host'],
    (int)$cfg['db_port'],
    $cfg['db_name']
  );
  $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  return $pdo;
}

function ensure_schema(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS todos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(80) NOT NULL,
    notes VARCHAR(255) NOT NULL DEFAULT '',
    cycle_type VARCHAR(20) NOT NULL DEFAULT 'once',
    interval_minutes INT NULL,
    window_start CHAR(5) NULL,
    window_end CHAR(5) NULL,
    goal_amount DECIMAL(12,2) NULL,
    goal_unit VARCHAR(16) NULL,
    progress_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    per_interval_amount DECIMAL(12,2) NULL,
    next_at DATETIME NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

  // upgrade old tables safely
  $cols = [];
  foreach ($pdo->query("SHOW COLUMNS FROM todos")->fetchAll() as $c) {
    $cols[$c['Field']] = true;
  }
  if (!isset($cols['progress_amount'])) {
    $pdo->exec("ALTER TABLE todos ADD COLUMN progress_amount DECIMAL(12,2) NOT NULL DEFAULT 0");
  }
  if (!isset($cols['per_interval_amount'])) {
    $pdo->exec("ALTER TABLE todos ADD COLUMN per_interval_amount DECIMAL(12,2) NULL");
  }
  if (!isset($cols['sort_order'])) {
    $pdo->exec("ALTER TABLE todos ADD COLUMN sort_order INT NOT NULL DEFAULT 0");
    $pdo->exec("UPDATE todos SET sort_order = id");
  }

  $pdo->exec("CREATE TABLE IF NOT EXISTS progress_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    todo_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    unit VARCHAR(16) NOT NULL DEFAULT '',
    note VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (todo_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

  $pdo->exec("CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    role VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    intent VARCHAR(32) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

  $pdo->exec("CREATE TABLE IF NOT EXISTS app_meta (
    k VARCHAR(64) NOT NULL PRIMARY KEY,
    v VARCHAR(255) NOT NULL DEFAULT '',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

  // pages / reminders schemas when helpers already loaded
  if (function_exists('ensure_pages_schema')) {
    ensure_pages_schema($pdo);
  }
  if (function_exists('ensure_reminders_schema')) {
    ensure_reminders_schema($pdo);
  }
}
