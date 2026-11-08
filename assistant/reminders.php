<?php
/**
 * 强提醒：每次调用 DeepSeek 必读的固定规则。
 * 人加一次，之后不用重复说；助理也可 CRUD。
 */

function ensure_reminders_schema(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS strong_reminders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sort_no INT NOT NULL DEFAULT 0,
    title VARCHAR(80) NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (enabled, sort_no, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function list_reminders(PDO $pdo, bool $enabledOnly = false): array {
  ensure_reminders_schema($pdo);
  $sql = "SELECT id, sort_no, title, content, enabled, updated_at FROM strong_reminders";
  if ($enabledOnly) $sql .= " WHERE enabled=1";
  $sql .= " ORDER BY sort_no ASC, id ASC";
  return $pdo->query($sql)->fetchAll();
}

function reminders_for_prompt(PDO $pdo): array {
  $rows = list_reminders($pdo, true);
  $out = [];
  $i = 1;
  foreach ($rows as $r) {
    $out[] = [
      'n' => $i++,
      'id' => (int)$r['id'],
      'title' => $r['title'],
      'content' => $r['content'],
    ];
  }
  return $out;
}

function format_reminders_block(array $reminders): string {
  if (!$reminders) return '（暂无强提醒）';
  $lines = [];
  foreach ($reminders as $r) {
    $title = trim((string)($r['title'] ?? ''));
    $body = trim((string)($r['content'] ?? ''));
    $head = $title !== '' ? ("【{$title}】") : '';
    $lines[] = '强提醒' . ($r['n'] ?? $r['id'] ?? '') . '：' . $head . $body;
  }
  return implode("\n", $lines);
}

function upsert_reminder(PDO $pdo, array $action): array {
  ensure_reminders_schema($pdo);
  $id = (int)($action['id'] ?? 0);
  $title = mb_substr(trim((string)($action['title'] ?? '')), 0, 80);
  $content = trim((string)($action['content'] ?? $action['text'] ?? ''));
  if ($content === '') throw new RuntimeException('强提醒内容不能为空');
  if (mb_strlen($content) > 2000) $content = mb_substr($content, 0, 2000);
  $enabled = isset($action['enabled']) ? ((int)!empty($action['enabled'])) : 1;
  $sortNo = isset($action['sort_no']) ? (int)$action['sort_no'] : null;

  if ($id > 0) {
    $row = $pdo->query('SELECT * FROM strong_reminders WHERE id=' . $id)->fetch();
    if (!$row) throw new RuntimeException('强提醒不存在：#' . $id);
    if ($sortNo === null) $sortNo = (int)$row['sort_no'];
    $pdo->prepare('UPDATE strong_reminders SET sort_no=?, title=?, content=?, enabled=? WHERE id=?')
      ->execute([$sortNo, $title, $content, $enabled, $id]);
  } else {
    if ($sortNo === null) {
      $sortNo = (int)$pdo->query('SELECT COALESCE(MAX(sort_no),0)+1 FROM strong_reminders')->fetchColumn();
    }
    $pdo->prepare('INSERT INTO strong_reminders (sort_no, title, content, enabled) VALUES (?,?,?,?)')
      ->execute([$sortNo, $title, $content, $enabled]);
    $id = (int)$pdo->lastInsertId();
  }
  return $pdo->query('SELECT * FROM strong_reminders WHERE id=' . $id)->fetch();
}

function delete_reminder(PDO $pdo, int $id): bool {
  ensure_reminders_schema($pdo);
  $st = $pdo->prepare('DELETE FROM strong_reminders WHERE id=?');
  $st->execute([$id]);
  return $st->rowCount() > 0;
}

function reorder_reminders(PDO $pdo, array $ids): void {
  ensure_reminders_schema($pdo);
  $ids = array_values(array_filter(array_map('intval', $ids)));
  $st = $pdo->prepare('UPDATE strong_reminders SET sort_no=? WHERE id=?');
  $n = 1;
  foreach ($ids as $id) {
    $st->execute([$n, $id]);
    $n++;
  }
}
