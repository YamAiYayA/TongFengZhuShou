<?php
// CACHE_BUST_THINKING_V2

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/goal.php';

function deepseek_api_key(): string {
  $cfg = require __DIR__ . '/config.php';
  $key = trim((string)($cfg['deepseek_api_key'] ?? ''));
  if ($key === '') {
    throw new RuntimeException('未配置 DeepSeek Key');
  }
  return $key;
}

/**
 * Non-stream helper (internal fallback).
 */
function deepseek_chat(array $messages, float $temperature = 0.1): string {
  $full = '';
  deepseek_chat_stream($messages, function (string $delta) use (&$full) {
    $full .= $delta;
  }, $temperature);
  if (trim($full) === '') {
    throw new RuntimeException('DeepSeek 返回为空');
  }
  return $full;
}

/**
 * Stream DeepSeek-Flash via SSE; invoke $onDelta for each content token.
 */
function deepseek_chat_stream(array $messages, callable $onDelta, float $temperature = 0.1, ?callable $onThinking = null): string {
  $key = deepseek_api_key();
  $payload = json_encode([
    'model' => 'deepseek-flash',
    'stream' => true,
    'thinking' => ['type' => 'enabled'],
    'reasoning_effort' => 'high',
    'messages' => $messages,
  ], JSON_UNESCAPED_UNICODE);

  $buffer = '';
  $full = '';
  $thinkingFull = '';

  $ch = curl_init('https://api.deepseek.com/chat/completions');
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
      'Content-Type: application/json',
      'Authorization: Bearer ' . $key,
      'Accept: text/event-stream',
    ],
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_TIMEOUT => 180,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => 0,
    CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$buffer, &$full, &$thinkingFull, $onDelta, $onThinking) {
      $buffer .= $chunk;
      while (($pos = strpos($buffer, "\n")) !== false) {
        $line = trim(substr($buffer, 0, $pos));
        $buffer = substr($buffer, $pos + 1);
        if ($line === '' || strncmp($line, ':', 1) === 0) continue;
        if (strncmp($line, 'data:', 5) !== 0) continue;
        $data = trim(substr($line, 5));
        if ($data === '[DONE]') continue;
        $json = json_decode($data, true);
        if (!is_array($json)) continue;
        $delta = $json['choices'][0]['delta'] ?? [];
        if (!is_array($delta)) continue;

        $reason = $delta['reasoning_content'] ?? '';
        if (is_string($reason) && $reason !== '') {
          $thinkingFull .= $reason;
          if ($onThinking) {
            $onThinking($reason);
          }
        }

        $content = $delta['content'] ?? '';
        if (is_string($content) && $content !== '') {
          $full .= $content;
          $onDelta($content);
        }
      }
      return strlen($chunk);
    },
  ]);

  $ok = curl_exec($ch);
  $errno = curl_errno($ch);
  $err = curl_error($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($ok === false || $errno) {
    throw new RuntimeException('DeepSeek 网络错误：' . $err);
  }
  if ($code < 200 || $code >= 300) {
    throw new RuntimeException('DeepSeek 调用失败 (' . $code . ')');
  }
  if (trim($full) === '') {
    // rare: only thinking returned
    if (trim($thinkingFull) !== '') {
      throw new RuntimeException('DeepSeek 只返回了思考内容，没有最终答案');
    }
    throw new RuntimeException('DeepSeek 流式返回为空');
  }
  return $full;
}

function extract_json_object(string $text): array {
  if (preg_match('/```(?:json)?\s*([\s\S]*?)```/i', $text, $m)) {
    $text = $m[1];
  }
  $start = strpos($text, '{');
  $end = strrpos($text, '}');
  if ($start === false || $end === false || $end <= $start) {
    throw new RuntimeException('AI 未返回 JSON');
  }
  $decoded = json_decode(substr($text, $start, $end - $start + 1), true);
  if (!is_array($decoded)) {
    throw new RuntimeException('AI JSON 解析失败');
  }
  return $decoded;
}

function heuristic_interval_goal(string $prompt): ?array {
  if (!preg_match('/每\s*(\d+)\s*分钟|每隔\s*(\d+)\s*分钟|(\d+)\s*分钟一次/u', $prompt, $im)) {
    return null;
  }
  $minutes = (int)($im[1] ?: ($im[2] ?: $im[3]));
  if ($minutes < 1) return null;

  $windowStart = '09:00';
  $windowEnd = '21:00';
  if (preg_match('/(\d{1,2})[:点：](\d{0,2}).{0,8}?(?:到|至|-|–).{0,8}?(\d{1,2})[:点：](\d{0,2})/u', $prompt, $wm)) {
    $h1 = (int)$wm[1]; $m1 = (int)($wm[2] !== '' ? $wm[2] : 0);
    $h2 = (int)$wm[3]; $m2 = (int)($wm[4] !== '' ? $wm[4] : 0);
    $windowStart = sprintf('%02d:%02d', $h1, $m1);
    $windowEnd = sprintf('%02d:%02d', $h2, $m2);
  }

  $goalAmount = null;
  $goalUnit = null;
  if (preg_match('/(\d+(?:\.\d+)?)\s*[lL升]/u', $prompt, $g)) {
    $goalAmount = (float)$g[1];
    $goalUnit = 'L';
  } elseif (preg_match('/(\d+)\s*ml/iu', $prompt, $g)) {
    $goalAmount = (float)$g[1];
    $goalUnit = 'ml';
  }

  $title = preg_match('/喝\s*水|饮水|补水|喝一次水/u', $prompt) ? '喝水' : '间隔目标';

  return [
    'intent' => 'create_goal',
    'summary' => '',
    'todo' => [
      'title' => $title,
      'notes' => '',
      'cycle_type' => 'interval',
      'interval_minutes' => $minutes,
      'window_start' => $windowStart,
      'window_end' => $windowEnd,
      'goal_amount' => $goalAmount,
      'goal_unit' => $goalUnit,
      'progress_amount' => 0,
    ],
  ];
}

function heuristic_progress(string $prompt): ?array {
  if (!preg_match('/(?:已经|目前|刚才|刚刚)?(?:喝了|喝完|完成了|打卡)\s*(\d+(?:\.\d+)?)\s*(L|l|升|ml|毫升)?/u', $prompt, $m)
    && !preg_match('/(?:进度|已喝|当前)\s*(\d+(?:\.\d+)?)\s*(L|l|升|ml|毫升)?/u', $prompt, $m)) {
    return null;
  }
  $amount = (float)$m[1];
  $unitRaw = $m[2] ?? 'L';
  $unit = in_array(strtolower($unitRaw), ['ml', '毫升'], true) ? 'ml' : 'L';
  $mode = 'set_progress';
  if (preg_match('/又喝了|再喝了|刚刚喝了|刚才喝了/u', $prompt)) {
    $mode = 'add_progress';
  } elseif (preg_match('/还差|剩余|剩下/u', $prompt)) {
    $mode = 'set_remaining';
  }
  return [
    'intent' => 'update_progress',
    'summary' => '',
    'progress' => [
      'mode' => $mode,
      'amount' => $amount,
      'unit' => $unit,
      'todo_title_hint' => preg_match('/水/u', $prompt) ? '喝水' : null,
    ],
  ];
}


function save_chat_message(PDO $pdo, string $role, string $content, ?string $intent = null): void {
  $content = trim($content);
  if ($content === '') return;
  $st = $pdo->prepare('INSERT INTO chat_messages (role, content, intent) VALUES (?,?,?)');
  $st->execute([$role, mb_substr($content, 0, 4000), $intent]);
}

function load_chat_history(PDO $pdo, int $limit = 12): array {
  $limit = max(2, min(30, $limit));
  $rows = $pdo->query("SELECT role, content, intent, created_at FROM chat_messages ORDER BY id DESC LIMIT {$limit}")->fetchAll();
  return array_reverse($rows);
}

function history_as_messages(array $history): array {
  $out = [];
  foreach ($history as $row) {
    $role = $row['role'] ?? '';
    if ($role !== 'user' && $role !== 'assistant') continue;
    $content = trim((string)($row['content'] ?? ''));
    if ($content === '') continue;
    $out[] = ['role' => $role, 'content' => $content];
  }
  return $out;
}

function build_assistant_messages(string $prompt, array $openTodos, array $history = [], array $pages = []): array {
  // 全量待办 + 页面：人只说话，数据与页面增删改查全靠 actions
  $todoBrief = [];
  foreach ($openTodos as $t) {
    $row = [
      'id' => (int)$t['id'],
      'title' => $t['title'],
      'notes' => $t['notes'] ?? '',
      'cycle_type' => $t['cycle_type'],
      'status' => $t['status'] ?? 'open',
      'sort_order' => isset($t['sort_order']) ? (int)$t['sort_order'] : 0,
      'interval_minutes' => $t['interval_minutes'] !== null ? (int)$t['interval_minutes'] : null,
      'window_start' => $t['window_start'],
      'window_end' => $t['window_end'],
      'goal_amount' => $t['goal_amount'] !== null ? (float)$t['goal_amount'] : null,
      'goal_unit' => $t['goal_unit'],
      'progress_amount' => (float)($t['progress_amount'] ?? 0),
    ];
    if (($t['cycle_type'] ?? '') === 'interval' && ($t['goal_amount'] ?? null)) {
      $row['calc'] = recalculate_per_interval($t);
    }
    $todoBrief[] = $row;
  }

  $system = "你是用户的私人秘书。架构：人 ↔ 你 ↔（数据库 + 页面）。\n"
    . "人几乎只说话。你有两种权限：\n"
    . "A) 对 todos 数据完全增删改查；B) 对展示页面完全增删改查（折线图/报表/说明页）。\n"
    . "用户要看图或报表时：你 upsert_page 生成网页，在 summary 里给出打开链接（服务端会回真实 URL）。\n"
    . "只输出 JSON。intent 只能是 chat 或 act。\n"
    . "chat: {\"intent\":\"chat\",\"summary\":\"……\",\"actions\":[]}\n"
    . "act: {\"intent\":\"act\",\"summary\":\"一句话确认\",\"actions\":[...]}\n"
    . "数据 op：create / update / delete / complete / reopen / archive / set_progress / reorder\n"
    . "页面 op：\n"
    . "- upsert_page: {\"op\":\"upsert_page\",\"slug\":\"water-progress\",\"title\":\"喝水进度\",\"kind\":\"chart_line\",\"spec\":{\"todo_id\":15}}\n"
    . "- upsert_page(html): {\"op\":\"upsert_page\",\"slug\":\"note-1\",\"title\":\"说明\",\"kind\":\"html\",\"html\":\"<p>...</p>\"}\n"
    . "- delete_page: {\"op\":\"delete_page\",\"slug\":\"...\"}\n"
    . "- list_pages: {\"op\":\"list_pages\"}\n"
    . "铁律：\n"
    . "1) 禁止嘴上说已改/已生成却不给 actions。\n"
    . "2) 闲聊 → chat；不要 invent 任务。\n"
    . "3) 新建周期目标必须用户说清间隔+时间窗+总量。\n"
    . "4) 改已有任务/排序/进度 → act。\n"
    . "5) 「现在X点」按该时刻算，此前时段已过。\n"
    . "6) 要折线图/页面/可视化 → upsert_page（kind=chart_line），不要只在聊天里画 ASCII。\n"
    . "7) summary 自然中文；页面类一定提示用户去打开链接。";

  $histText = '';
  foreach ($history as $h) {
    $role = (($h['role'] ?? '') === 'assistant') ? '助理' : '用户';
    $histText .= $role . '：' . trim((string)($h['content'] ?? '')) . "\n";
  }
  if ($histText === '') $histText = '（暂无）\n';

  $pageBrief = [];
  foreach ($pages as $p) {
    $pageBrief[] = [
      'slug' => $p['slug'] ?? '',
      'title' => $p['title'] ?? '',
      'kind' => $p['kind'] ?? '',
    ];
  }

  $user = "对话历史（从旧到新）：\n" . $histText
    . "\n用户本轮说：\n" . $prompt
    . "\n\n数据库任务（可增删改查）：\n" . json_encode($todoBrief, JSON_UNESCAPED_UNICODE)
    . "\n\n已有页面（可增删改查）：\n" . json_encode($pageBrief, JSON_UNESCAPED_UNICODE);

  $messages = [
    ['role' => 'system', 'content' => $system],
  ];
  foreach (history_as_messages($history) as $msg) {
    $messages[] = $msg;
  }
  $messages[] = ['role' => 'user', 'content' => $user];
  return $messages;
}

function assistant_fallback(string $prompt): array {
  $p = heuristic_progress($prompt);
  if ($p) {
    $p['mode'] = 'fallback';
    $p['summary'] = '已按进度规则解析';
    return $p;
  }
  $g = heuristic_interval_goal($prompt);
  if ($g) {
    $g['mode'] = 'fallback';
    $tmp = $g['todo'];
    $calc = recalculate_per_interval([
      'goal_amount' => $tmp['goal_amount'],
      'goal_unit' => $tmp['goal_unit'],
      'progress_amount' => 0,
      'window_start' => $tmp['window_start'],
      'window_end' => $tmp['window_end'],
      'interval_minutes' => $tmp['interval_minutes'],
    ]);
    $g['summary'] = '已创建目标：' . ($calc['status_text'] ?? '');
    return $g;
  }
  return [
    'intent' => 'chat',
    'mode' => 'fallback',
    'summary' => '收到。若要定目标，请告诉我时间段、间隔和总量，例如：9点到23点，每20分钟喝水，全天3L。',
  ];
}

/**
 * Stream-aware understand: calls $onDelta for each token, returns parsed intent array.
 */
function assistant_understand_stream(string $prompt, array $openTodos, callable $onDelta, ?callable $onThinking = null, array $history = [], array $pages = []): array {
  $prompt = trim($prompt);
  if ($prompt === '') throw new InvalidArgumentException('请输入内容');
  if (mb_strlen($prompt) > 2000) throw new InvalidArgumentException('内容过长');

  $messages = build_assistant_messages($prompt, $openTodos, $history, $pages);
  try {
    $content = deepseek_chat_stream($messages, $onDelta, 0.1, $onThinking);
    $parsed = extract_json_object($content);
    $intent = $parsed['intent'] ?? '';
    $ok = ['chat','act','create_goal','update_progress','update_todo','delete_todo','complete_todo','reorder','mutate','secretary'];
    if (in_array($intent, $ok, true)) {
      // Normalize everything mutable into act+actions for the secretary executor
      if ($intent !== 'chat' && empty($parsed['actions'])) {
        // leave as-is; legacy_intent_to_actions will map
      }
      if ($intent !== 'chat') {
        // keep original intent for legacy mapper; executor accepts both
      }
      $parsed['mode'] = 'live';
      $parsed['raw_text'] = $content;
      return $parsed;
    }
  } catch (Throwable $e) {
    $err = $e->getMessage();
  }

  $fb = assistant_fallback($prompt);
  if (isset($err)) {
    $fb['summary'] = ($fb['summary'] ?? '') . '（AI: ' . $err . '）';
  }
  return $fb;
}

function assistant_understand(string $prompt, array $openTodos, array $history = []): array {
  return assistant_understand_stream($prompt, $openTodos, function ($delta) {}, null, $history);
}
