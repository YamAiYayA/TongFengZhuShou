<?php
date_default_timezone_set('Asia/Shanghai');
if (function_exists('opcache_invalidate')) {
  @opcache_invalidate(__DIR__ . '/assistant_ai.php', true);
  @opcache_invalidate(__DIR__ . '/secretary.php', true);
}
require __DIR__ . '/db.php';
require __DIR__ . '/goal.php';
require __DIR__ . '/pages.php';
require __DIR__ . '/assistant_ai.php';
require __DIR__ . '/secretary.php';

function json_out($data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function sse_headers(): void {
  header('Content-Type: text/event-stream; charset=utf-8');
  header('Cache-Control: no-cache, no-store');
  header('Connection: keep-alive');
  header('X-Accel-Buffering: no');
  while (ob_get_level() > 0) { ob_end_flush(); }
  @ini_set('output_buffering', 'off');
  @ini_set('zlib.output_compression', 0);
}

function sse_send(array $payload): void {
  echo 'data: ' . json_encode($payload, JSON_UNESCAPED_UNICODE) . "\n\n";
  @ob_flush();
  @flush();
}

function insert_todo(PDO $pdo, array $t): array {
  $row = [
    'title' => mb_substr(trim((string)($t['title'] ?? '')), 0, 80),
    'notes' => mb_substr(trim((string)($t['notes'] ?? '')), 0, 255),
    'cycle_type' => $t['cycle_type'] ?? 'once',
    'interval_minutes' => $t['interval_minutes'] ?? null,
    'window_start' => $t['window_start'] ?? null,
    'window_end' => $t['window_end'] ?? null,
    'goal_amount' => $t['goal_amount'] ?? null,
    'goal_unit' => $t['goal_unit'] ?? null,
    'progress_amount' => $t['progress_amount'] ?? 0,
  ];
  if ($row['title'] === '') throw new InvalidArgumentException('标题不能为空');
  if (!in_array($row['cycle_type'], ['once','daily','weekly','interval'], true)) {
    $row['cycle_type'] = 'once';
  }

  $calc = recalculate_per_interval($row);
  $per = $calc['per_interval_amount'];

  $sort = isset($t['sort_order']) ? (int)$t['sort_order'] : (int)$pdo->query("SELECT COALESCE(MIN(sort_order),0)-1 FROM todos")->fetchColumn();
  $st = $pdo->prepare("INSERT INTO todos
    (title, notes, cycle_type, interval_minutes, window_start, window_end, goal_amount, goal_unit, progress_amount, per_interval_amount, sort_order, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, 'open')");
  $st->execute([
    $row['title'], $row['notes'], $row['cycle_type'], $row['interval_minutes'],
    $row['window_start'], $row['window_end'], $row['goal_amount'], $row['goal_unit'],
    $row['progress_amount'], $per, $sort,
  ]);
  $id = (int)$pdo->lastInsertId();
  $todo = $pdo->query("SELECT * FROM todos WHERE id = {$id}")->fetch();
  return enrich_todo_row($todo);
}

function apply_progress(PDO $pdo, array $todo, array $progress, ?int $nowOverrideMin = null): array {
  $mode = $progress['mode'] ?? 'set_progress';
  $amount = (float)($progress['amount'] ?? 0);
  $unit = $progress['unit'] ?? null;
  if ($unit === null || $unit === '') {
    // 500 without unit + user said ml -> ml; >=100 default ml
    $unit = ($amount >= 100 ? 'ml' : (string)($todo['goal_unit'] ?? 'L'));
  }
  $goalUnit = (string)($todo['goal_unit'] ?? 'L');

  [$addBase, $baseUnit] = to_base_amount($amount, $unit);
  [$curBase] = to_base_amount((float)$todo['progress_amount'], $goalUnit);
  [$goalBase] = to_base_amount((float)$todo['goal_amount'], $goalUnit);

  if ($mode === 'add_progress') {
    $newBase = $curBase + $addBase;
  } elseif ($mode === 'set_remaining') {
    $newBase = max(0.0, $goalBase - $addBase);
  } else {
    $newBase = $addBase;
  }
  $newBase = max(0.0, $newBase);
  [$newProgress] = from_base_amount($newBase, $baseUnit === 'ml' ? 'ml' : $baseUnit, $goalUnit);

  $pdo->prepare("UPDATE todos SET progress_amount=? WHERE id=?")->execute([$newProgress, $todo['id']]);
  $pdo->prepare("INSERT INTO progress_logs (todo_id, amount, unit, note) VALUES (?,?,?,?)")
    ->execute([$todo['id'], $amount, $unit, $mode]);

  $todo = $pdo->query("SELECT * FROM todos WHERE id = " . (int)$todo['id'])->fetch();
  $enriched = enrich_todo_row($todo, $nowOverrideMin);
  $pdo->prepare("UPDATE todos SET per_interval_amount=? WHERE id=?")
    ->execute([$enriched['calc']['per_interval_amount'], $todo['id']]);
  if (function_exists('refresh_bound_chart_pages')) {
    refresh_bound_chart_pages($pdo, (int)$todo['id']);
  }
  $todo = $pdo->query("SELECT * FROM todos WHERE id = " . (int)$todo['id'])->fetch();
  return enrich_todo_row($todo, $nowOverrideMin);
}


function user_stated_schedule(string $prompt): bool {
  $hasInterval = preg_match('/每\s*\d+\s*分钟|每隔\s*\d+|(\d+)\s*分钟一次/u', $prompt);
  $hasWindow = preg_match('/\d{1,2}\s*[:点：]/u', $prompt);
  $hasGoal = preg_match('/\d+(?:\.\d+)?\s*(L|l|升|ml|毫升)|目标/u', $prompt);
  return $hasInterval && ($hasWindow || $hasGoal);
}

function user_stated_progress(string $prompt): bool {
  return (bool)preg_match('/喝了|喝完|已喝|又喝|进度|还差|剩余|剩下|完成了|打卡/u', $prompt);
}

function normalize_progress_payload(array $understood, string $prompt): array {
  $progress = $understood['progress'] ?? [];
  if (!is_array($progress)) $progress = [];
  if (!isset($progress['todo_id']) && isset($progress['goal_id'])) {
    $progress['todo_id'] = $progress['goal_id'];
  }
  // Model sometimes puts amount at top level
  if (!isset($progress['amount']) && isset($understood['amount'])) {
    $progress['amount'] = $understood['amount'];
  }
  if ((!isset($progress['unit']) || $progress['unit'] === '') && isset($progress['amount'])) {
    if (preg_match('/ml|毫升/iu', $prompt)) $progress['unit'] = 'ml';
    elseif (preg_match('/\d+(?:\.\d+)?\s*[lL升]/u', $prompt)) $progress['unit'] = 'L';
  }
  if (!isset($progress['mode']) || $progress['mode'] === '') {
    if (preg_match('/又喝了|再喝了|刚刚喝了|刚才喝了/u', $prompt)) $progress['mode'] = 'add_progress';
    elseif (preg_match('/还差|剩余|剩下/u', $prompt)) $progress['mode'] = 'set_remaining';
    else $progress['mode'] = 'set_progress';
  }
  // Heuristic fill if model forgot amount
  if (!isset($progress['amount']) || $progress['amount'] === '' || $progress['amount'] === null) {
    $h = heuristic_progress($prompt);
    if ($h && isset($h['progress']) && is_array($h['progress'])) {
      foreach (['mode','amount','unit','todo_title_hint'] as $k) {
        if ((!isset($progress[$k]) || $progress[$k] === '' || $progress[$k] === null) && isset($h['progress'][$k])) {
          $progress[$k] = $h['progress'][$k];
        }
      }
    }
  }
  return $progress;
}

function pick_progress_target(array $open, array $progress): ?array {
  $target = null;
  $todoId = (int)($progress['todo_id'] ?? 0);
  if ($todoId > 0) {
    foreach ($open as $t) {
      if ((int)$t['id'] === $todoId) return $t;
    }
  }
  $hint = (string)($progress['todo_title_hint'] ?? '');
  foreach ($open as $t) {
    if (($t['cycle_type'] ?? '') !== 'interval' || !($t['goal_amount'] ?? null)) continue;
    if ($hint !== '' && mb_strpos((string)$t['title'], $hint) !== false) return $t;
    if (mb_strpos((string)$t['title'], '水') !== false) return $t;
    if (!$target) $target = $t;
  }
  return $target;
}

function summarize_progress_update(array $todo, ?int $nowOverride, string $preferred = ''): string {
  // Prefer server math; model summary often invents wrong per-sip numbers
  $prog = $todo['progress_amount'] ?? 0;
  $unit = $todo['goal_unit'] ?? '';
  $status = $todo['calc']['status_text'] ?? '';
  $summary = "已记录进度 {$prog}{$unit}";
  if ($status !== '') $summary .= '，' . $status;
  $pastDropped = 0;
  if ($nowOverride !== null && !empty($todo['window_start']) && !empty($todo['interval_minutes'])) {
    $start = hm_to_minutes($todo['window_start']);
    $interval = (int)$todo['interval_minutes'];
    if ($start !== null && $interval > 0 && $nowOverride > $start) {
      $pastDropped = (int)floor(($nowOverride - $start) / $interval);
    }
  }
  if ($pastDropped > 0) {
    $hh = sprintf('%02d:%02d', intdiv($nowOverride, 60), $nowOverride % 60);
    $summary .= "；按你说的 {$hh}，已隐藏此前 {$pastDropped} 个时间点";
  }
  // Keep a short model tone prefix only if it doesn't contradict
  if ($preferred !== '' && mb_strlen($preferred) < 40 && mb_strpos($preferred, 'ml') === false) {
    $summary = rtrim($preferred, '。') . '。' . $summary;
  }
  return $summary;
}

/** AI proposes; secretary executes against DB. Humans only talk. */
function apply_understood(PDO $pdo, array $understood, array $open, string $prompt = ''): array {
  return apply_secretary($pdo, $understood, $open, $prompt);
}

try {
  $pdo = db();
  ensure_schema($pdo);
  $method = $_SERVER['REQUEST_METHOD'];
  $action = $_GET['action'] ?? 'list';

  if ($method === 'GET' && $action === 'list') {
    $rows = load_open_todos($pdo);
    // Priority: prefer_logical (user said 现在12点) > ?now= > stored logical > wall clock
    $nowOverride = null;
    if (!empty($_GET['prefer_logical'])) {
      $logical = get_logical_now_minutes($pdo);
      if ($logical !== null) {
        $nowOverride = $logical;
      } elseif (!empty($_GET['now'])) {
        $nowOverride = hm_to_minutes((string)$_GET['now']);
      }
    } elseif (!empty($_GET['now'])) {
      $nowOverride = hm_to_minutes((string)$_GET['now']);
      // Client sending an explicit test clock also persists it
      if ($nowOverride !== null && !empty($_GET['as_logical'])) {
        set_logical_now_minutes($pdo, $nowOverride);
      }
    } else {
      $nowOverride = get_logical_now_minutes($pdo);
    }
    $rows = array_map(function ($row) use ($nowOverride) {
      return enrich_todo_row($row, $nowOverride);
    }, $rows);
    $ref = $nowOverride !== null
      ? sprintf('%02d:%02d', intdiv($nowOverride, 60), $nowOverride % 60)
      : (new DateTimeImmutable('now'))->format('H:i');
    ensure_pages_schema($pdo);
    $pageRows = list_pages($pdo);
    $pagesOut = array_map(function ($p) {
      return [
        'slug' => $p['slug'],
        'title' => $p['title'],
        'kind' => $p['kind'],
        'url' => page_public_url($p['slug']),
        'updated_at' => $p['updated_at'] ?? null,
      ];
    }, $pageRows);
    json_out([
      'todos' => $rows,
      'pages' => $pagesOut,
      'server_time' => (new DateTimeImmutable('now'))->format('H:i'),
      'ref_time' => $ref,
      'logical_now' => get_logical_now_minutes($pdo),
    ]);
  }

  if ($method === 'GET' && $action === 'chat_history') {
    ensure_schema($pdo);
    json_out(['messages' => load_chat_history($pdo, 40)]);
  }

  if ($method === 'POST' && $action === 'chat_clear') {
    $pdo->exec('DELETE FROM chat_messages');
    $pdo->exec("DELETE FROM app_meta WHERE k='logical_now'");
    json_out(['ok' => true]);
  }

  $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];

  if ($method === 'POST' && $action === 'create') {
    json_out(['todo' => insert_todo($pdo, $body)], 201);
  }

  if ($method === 'POST' && $action === 'ai_stream') {
    sse_headers();
    $prompt = trim((string)($body['prompt'] ?? ''));
    try {
      $open = load_open_todos($pdo);
      $history = load_chat_history($pdo, 12);
      ensure_pages_schema($pdo);
      $pages = list_pages($pdo);
      save_chat_message($pdo, 'user', $prompt, null);
      sse_send(['type' => 'start', 'model' => 'deepseek-flash', 'thinking' => true]);
      $understood = assistant_understand_stream(
        $prompt,
        $open,
        function (string $delta) {
          sse_send(['type' => 'token', 'text' => $delta]);
        },
        function (string $delta) {
          sse_send(['type' => 'thinking', 'text' => $delta]);
        },
        $history,
        $pages
      );
      $result = apply_understood($pdo, $understood, $open, $prompt);
      $reply = (string)($result['summary'] ?? '');
      save_chat_message($pdo, 'assistant', $reply, $result['intent'] ?? null);
      $result['messages'] = load_chat_history($pdo, 40);
      sse_send(['type' => 'done', 'result' => $result]);
    } catch (Throwable $e) {
      sse_send(['type' => 'error', 'error' => $e->getMessage()]);
    }
    echo "data: [DONE]\n\n";
    @ob_flush();
    @flush();
    exit;
  }

  if ($method === 'POST' && $action === 'ai_parse') {
    $prompt = trim((string)($body['prompt'] ?? ''));
    $open = load_open_todos($pdo);
    $history = load_chat_history($pdo, 12);
    ensure_pages_schema($pdo);
    $pages = list_pages($pdo);
    save_chat_message($pdo, 'user', $prompt, null);
    $understood = assistant_understand_stream($prompt, $open, function ($delta) {}, null, $history, $pages);
    $result = apply_understood($pdo, $understood, $open, $prompt);
    save_chat_message($pdo, 'assistant', (string)($result['summary'] ?? ''), $result['intent'] ?? null);
    $result['messages'] = load_chat_history($pdo, 40);
    json_out($result);
  }

  if ($method === 'POST' && $action === 'done') {
    $id = (int)($body['id'] ?? 0);
    $pdo->prepare("UPDATE todos SET status='done' WHERE id=?")->execute([$id]);
    json_out(['ok' => true]);
  }

  if ($method === 'POST' && $action === 'delete') {
    $id = (int)($body['id'] ?? 0);
    $pdo->prepare("DELETE FROM todos WHERE id=?")->execute([$id]);
    json_out(['ok' => true]);
  }

  json_out(['error' => '未知操作'], 400);
} catch (Throwable $e) {
  json_out(['error' => $e->getMessage()], 500);
}
