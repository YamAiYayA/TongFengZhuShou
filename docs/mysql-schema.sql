-- Future MySQL schema (v1 local SQLite mirrors these tables/columns).
-- Local app currently uses expo-sqlite; sync layer can upsert by id / user_id later.

CREATE TABLE user_settings (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  daily_goal_ml INT NOT NULL,
  wake_time CHAR(5) NOT NULL COMMENT 'HH:mm',
  cutoff_time CHAR(5) NOT NULL COMMENT 'HH:mm',
  quick_amounts_json JSON NOT NULL,
  notifications_enabled TINYINT NOT NULL DEFAULT 1,
  repeat_interval_minutes INT NOT NULL DEFAULT 15 COMMENT '未操作时重复提醒间隔（分钟）',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE water_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  drunk_at DATETIME(3) NOT NULL,
  amount_ml INT NOT NULL,
  source VARCHAR(32) NOT NULL COMMENT 'reminder|manual',
  note VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  KEY idx_water_logs_user_drunk (user_id, drunk_at),
  KEY idx_water_logs_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reminder_jobs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  fire_at DATETIME(3) NOT NULL,
  kind VARCHAR(32) NOT NULL COMMENT 'water|first_cup',
  status VARCHAR(32) NOT NULL COMMENT 'pending|fired|cancelled|snoozed|completed',
  payload_json JSON NULL,
  notification_id VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  KEY idx_reminder_jobs_user_status_fire (user_id, status, fire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
