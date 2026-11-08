<?php
/**
 * Personal secretary layer: AI proposes actions; server executes CRUD on todos.
 * Never trust verbal "已调整" without a matching action.
 */

const SECRETARY_ALLOWED_FIELDS = [
  'title', 'notes', 'cycle_type', 'interval_minutes', 'window_start', 'window_end',
  'goal_amount', 'goal_unit', 'progress_amount', 'status', 'sort_order',
];

function load_open_todos(PDO $pdo): array {
  return $pdo->query("SELECT * FROM todos WHERE status <> 'archived' ORDER BY sort_order ASC, id DESC")->fetchAll();
}

function enrich_todo_list(array $rows, ?int $nowOverride = null): array {
  return array_map(function ($row) use ($nowOverride) {
    return enrich_todo_row($row, $nowOverride);
  }, $rows);
}

function find_todo_by_id(array $rows, int $id): ?array {
  foreach ($rows as $t) {
    if ((int)$t['id'] === $id) return $t;
  }
  return null;
}

function resolve_todo_id(array $action, array $open): int {
  $id = (int)($action['id'] ?? $action['todo_id'] ?? $action['goal_id'] ?? 0);
  if ($id > 0) return $id;
  $hint = trim((string)($action['title_hint'] ?? $action['title'] ?? ''));
  if ($hint !== '') {
    foreach ($open as $t) {
      if (mb_strpos((string)$t['title'], $hint) !== false) return (int)$t['id'];
    }
  }
  // default: newest interval goal with amount
  foreach ($open as $t) {
    if (($t['cycle_type'] ?? '') === 'interval' && ($t['goal_amount'] ?? null)) {
      if (mb_strpos((string)$t['title'], '水') !== false) return (int)$t['id'];
    }
  }
  foreach ($open as $t) {
    if (($t['status'] ?? '') === 'open') return (int)$t['id'];
  }
  return 0;
}

function sanitize_todo_fields(array $fields): array {
  $out = [];
  foreach (SECRETARY_ALLOWED_FIELDS as $k) {
    if (!array_key_exists($k, $fields)) continue;
    $v = $fields[$k];
    if ($v === '') $v = null;
    if (in_array($k, ['interval_minutes', 'sort_order'], true) && $v !== null) $v = (int)$v;
    if (in_array($k, ['goal_amount', 'progress_amount'], true) && $v !== null) $v = (float)$v;
    if ($k === 'cycle_type' && $v !== null && !in_array($v, ['once','daily','weekly','interval'], true)) {
      $v = 'once';
    }
    if ($k === 'status' && $v !== null && !in_array($v, ['open','done','archived'], true)) {
      continue;
    }
    if ($k === 'title' && $v !== null) $v = mb_substr(trim((string)$v), 0, 80);
    if ($k === 'notes' && $v !== null) $v = mb_substr(trim((string)$v), 0, 255);
    if (in_array($k, ['window_start','window_end'], true) && $v !== null) {
      if (!preg_match('/^\d{1,2}:\d{2}$/', (string)$v)) continue;
      $parts = explode(':', (string)$v);
      $v = sprintf('%02d:%02d', (int)$parts[0], (int)$parts[1]);
    }
    $out[$k] = $v;
  }
  return $out;
}

function update_todo_fields(PDO $pdo, int $id, array $fields): ?array {
  $fields = sanitize_todo_fields($fields);
  if (!$fields) return null;
  $sets = [];
  $vals = [];
  foreach ($fields as $k => $v) {
    $sets[] = "`$k`=?";
    $vals[] = $v;
  }
  $vals[] = $id;
  $pdo->prepare('UPDATE todos SET ' . implode(',', $sets) . ' WHERE id=?')->execute($vals);

  // Recalc per_interval if schedule/goal/progress changed
  $touch = array_intersect_key($fields, array_flip([
    'interval_minutes','window_start','window_end','goal_amount','goal_unit','progress_amount',
  ]));
  $todo = $pdo->query('SELECT * FROM todos WHERE id=' . (int)$id)->fetch();
  if ($todo && $touch) {
    $calc = recalculate_per_interval($todo);
    $pdo->prepare('UPDATE todos SET per_interval_amount=? WHERE id=?')
      ->execute([$calc['per_interval_amount'], $id]);
    $todo = $pdo->query('SELECT * FROM todos WHERE id=' . (int)$id)->fetch();
  }
  return $todo ?: null;
}

function reorder_todos(PDO $pdo, array $ids): void {
  $ids = array_values(array_filter(array_map('intval', $ids), function ($x) { return $x > 0; }));
  $ord = 0;
  $st = $pdo->prepare('UPDATE todos SET sort_order=? WHERE id=?');
  foreach ($ids as $id) {
    $st->execute([$ord, $id]);
    $ord++;
  }
}

/**
 * Execute one secretary action. Returns human note fragment or null.
 * Optional &$meta collects page_urls etc.
 */
function execute_secretary_action(PDO $pdo, array $action, array &$open, ?int $nowOverride, string $prompt, array &$meta = []): ?string {
  $op = strtolower(trim((string)($action['op'] ?? $action['action'] ?? '')));
  if ($op === '') return null;

  if ($op === 'create' || $op === 'create_goal' || $op === 'create_todo') {
    $todoIn = $action['todo'] ?? $action;
    if (!is_array($todoIn)) return null;
    unset($todoIn['op'], $todoIn['action'], $todoIn['todo']);
    if (empty($todoIn['title'])) $todoIn['title'] = '待办';
    if (empty($todoIn['cycle_type'])) $todoIn['cycle_type'] = isset($todoIn['interval_minutes']) ? 'interval' : 'once';
    // sort to top
    $minSort = (int)$pdo->query("SELECT COALESCE(MIN(sort_order),0) FROM todos")->fetchColumn();
    $todoIn['sort_order'] = $minSort - 1;
    $todo = insert_todo($pdo, $todoIn);
    $open = load_open_todos($pdo);
    return '已新建「' . $todo['title'] . '」';
  }

  if ($op === 'update' || $op === 'patch' || $op === 'adjust') {
    $id = resolve_todo_id($action, $open);
    $fields = $action['fields'] ?? [];
    if (!is_array($fields) || !$fields) {
      // allow flat fields on action
      $fields = $action;
      unset($fields['op'], $fields['action'], $fields['id'], $fields['todo_id'], $fields['goal_id'], $fields['title_hint'], $fields['fields']);
    }
    if ($id <= 0) throw new RuntimeException('要改哪一条？请点名任务标题或 id');
    $before = find_todo_by_id($open, $id);
    $todo = update_todo_fields($pdo, $id, $fields);
    if (!$todo) throw new RuntimeException('没有可更新的字段');
    $open = load_open_todos($pdo);
    $title = $todo['title'] ?? ($before['title'] ?? ('#' . $id));
    $changed = implode('、', array_keys(sanitize_todo_fields($fields)));
    return "已更新「{$title}」({$changed})";
  }

  if ($op === 'delete' || $op === 'remove') {
    $id = resolve_todo_id($action, $open);
    if ($id <= 0) throw new RuntimeException('要删哪一条？');
    $before = find_todo_by_id($open, $id);
    $pdo->prepare('DELETE FROM todos WHERE id=?')->execute([$id]);
    $open = load_open_todos($pdo);
    return '已删除「' . ($before['title'] ?? ('#' . $id)) . '」';
  }

  if ($op === 'complete' || $op === 'done') {
    $id = resolve_todo_id($action, $open);
    if ($id <= 0) throw new RuntimeException('要完成哪一条？');
    $pdo->prepare("UPDATE todos SET status='done' WHERE id=?")->execute([$id]);
    $open = load_open_todos($pdo);
    $t = find_todo_by_id($open, $id) ?: ['title' => '#' . $id];
    return '已完成「' . ($t['title'] ?? ('#' . $id)) . '」';
  }

  if ($op === 'reopen') {
    $id = resolve_todo_id($action, $open);
    if ($id <= 0) throw new RuntimeException('要重开哪一条？');
    $pdo->prepare("UPDATE todos SET status='open' WHERE id=?")->execute([$id]);
    $open = load_open_todos($pdo);
    return '已重开 #' . $id;
  }

  if ($op === 'archive') {
    $id = resolve_todo_id($action, $open);
    if ($id <= 0) throw new RuntimeException('要归档哪一条？');
    $pdo->prepare("UPDATE todos SET status='archived' WHERE id=?")->execute([$id]);
    $open = load_open_todos($pdo);
    return '已归档 #' . $id;
  }

  if ($op === 'set_progress' || $op === 'update_progress' || $op === 'progress') {
    $id = resolve_todo_id($action, $open);
    if ($id <= 0) throw new RuntimeException('没有可更新进度的目标');
    $target = find_todo_by_id($open, $id);
    if (!$target) throw new RuntimeException('目标不存在');
    $progress = [
      'mode' => $action['mode'] ?? 'set_progress',
      'amount' => $action['amount'] ?? null,
      'unit' => $action['unit'] ?? null,
      'todo_id' => $id,
    ];
    $progress = normalize_progress_payload(['progress' => $progress], $prompt);
    if (!isset($progress['amount'])) throw new RuntimeException('进度数量缺失');
    apply_progress($pdo, $target, $progress, $nowOverride);
    $open = load_open_todos($pdo);
    $fresh = find_todo_by_id($open, $id);
    $amt = $progress['amount'];
    $unit = $progress['unit'] ?? '';
    return "已记进度 {$amt}{$unit}（当前 " . ($fresh['progress_amount'] ?? '?') . ($fresh['goal_unit'] ?? '') . '）';
  }

  if ($op === 'reorder' || $op === 'sort') {
    $ids = $action['ids'] ?? [];
    if (!is_array($ids) || !$ids) throw new RuntimeException('排序需要 ids 数组');
    reorder_todos($pdo, $ids);
    $open = load_open_todos($pdo);
    return '已按你的要求重新排序';
  }

  // —— 页面 CRUD：助理生成/改网页，人打开链接查看 ——
  if ($op === 'upsert_page' || $op === 'create_page' || $op === 'update_page' || $op === 'make_page') {
    [$row, $url] = upsert_page($pdo, $action, $open);
    $meta['page_urls'][] = $url;
    $meta['pages'][] = [
      'slug' => $row['slug'] ?? null,
      'title' => $row['title'] ?? null,
      'kind' => $row['kind'] ?? null,
      'url' => $url,
    ];
    $title = $row['title'] ?? '页面';
    return "已生成页面「{$title}」→ {$url}";
  }

  if ($op === 'delete_page') {
    $slug = sanitize_page_slug((string)($action['slug'] ?? ''));
    if ($slug === '' || !delete_page_by_slug($pdo, $slug)) {
      throw new RuntimeException('要删哪个页面？请给 slug');
    }
    return '已删除页面 ' . $slug;
  }

  if ($op === 'list_pages') {
    $pages = list_pages($pdo);
    $meta['pages'] = array_map(function ($p) {
      $url = page_public_url($p['slug']);
      return [
        'slug' => $p['slug'],
        'title' => $p['title'],
        'kind' => $p['kind'],
        'url' => $url,
      ];
    }, $pages);
    if (!$pages) return '目前还没有页面';
    $bits = [];
    foreach ($meta['pages'] as $p) {
      $bits[] = $p['title'] . ' → ' . $p['url'];
    }
    return '现有页面：' . implode('；', $bits);
  }

  // —— 强提醒 CRUD：每次对话必读 ——
  if ($op === 'upsert_reminder' || $op === 'add_reminder' || $op === 'create_reminder' || $op === 'update_reminder') {
    $row = upsert_reminder($pdo, $action);
    $meta['reminders'] = reminders_for_prompt($pdo);
    $label = $row['title'] !== '' ? $row['title'] : mb_substr($row['content'], 0, 20);
    return '已保存强提醒#' . $row['id'] . '「' . $label . '」';
  }

  if ($op === 'delete_reminder') {
    $id = (int)($action['id'] ?? 0);
    if ($id <= 0 || !delete_reminder($pdo, $id)) throw new RuntimeException('要删哪条强提醒？');
    $meta['reminders'] = reminders_for_prompt($pdo);
    return '已删除强提醒#' . $id;
  }

  if ($op === 'reorder_reminders') {
    $ids = $action['ids'] ?? [];
    if (!is_array($ids) || !$ids) throw new RuntimeException('排序需要 ids');
    reorder_reminders($pdo, $ids);
    $meta['reminders'] = reminders_for_prompt($pdo);
    return '已重排强提醒';
  }

  if ($op === 'noop' || $op === 'none') {
    return null;
  }

  throw new RuntimeException('未知操作：' . $op);
}

/**
 * Convert legacy single-intent payloads into actions[].
 */
function legacy_intent_to_actions(array $understood): array {
  $intent = $understood['intent'] ?? '';
  if ($intent === 'act' || $intent === 'mutate' || $intent === 'secretary') {
    $actions = $understood['actions'] ?? [];
    return is_array($actions) ? $actions : [];
  }
  if ($intent === 'create_goal' || $intent === 'create_todo') {
    $todo = $understood['todo'] ?? null;
    if (!$todo && isset($understood['todos'][0])) $todo = $understood['todos'][0];
    return $todo ? [['op' => 'create', 'todo' => $todo]] : [];
  }
  if ($intent === 'update_progress') {
    $p = $understood['progress'] ?? [];
    if (!is_array($p)) $p = [];
    $p['op'] = 'set_progress';
    return [$p];
  }
  if ($intent === 'update_todo' || $intent === 'update_goal') {
    return [[
      'op' => 'update',
      'id' => $understood['id'] ?? ($understood['todo']['id'] ?? null),
      'fields' => $understood['fields'] ?? ($understood['todo'] ?? []),
    ]];
  }
  if ($intent === 'delete_todo' || $intent === 'delete_goal') {
    return [['op' => 'delete', 'id' => $understood['id'] ?? null]];
  }
  if ($intent === 'complete_todo') {
    return [['op' => 'complete', 'id' => $understood['id'] ?? null]];
  }
  if ($intent === 'reorder' || $intent === 'sort_todos') {
    return [['op' => 'reorder', 'ids' => $understood['ids'] ?? []]];
  }
  // Already has actions alongside chat/other
  if (!empty($understood['actions']) && is_array($understood['actions'])) {
    return $understood['actions'];
  }
  return [];
}

/** When user clearly asks CRUD in Chinese, build actions even if the model only chatted. */
function heuristic_secretary_actions(string $prompt, array $open): array {
  $actions = [];

  // delete
  if (preg_match('/(?:删掉|删除|去掉|移除)\s*(?:这个|那个)?(?:待办|任务|目标)?\s*[「「"“]?([^」」"”]{1,40})?/u', $prompt, $m)
    || preg_match('/把\s*[「「"“]?([^」」"”]{1,40}?)[」」"”]?\s*(?:删掉|删除|去掉)/u', $prompt, $m2)) {
    $hint = trim($m[1] ?? ($m2[1] ?? ''));
    $id = 0;
    if ($hint !== '') {
      foreach ($open as $t) {
        if (mb_strpos((string)$t['title'], $hint) !== false) { $id = (int)$t['id']; break; }
      }
    }
    if ($id > 0) $actions[] = ['op' => 'delete', 'id' => $id];
  }

  // complete
  if (preg_match('/(?:完成了|搞定了|做完了|标记完成)\s*[「「"“]?([^」」"”]{0,40})/u', $prompt, $m)) {
    $hint = trim($m[1] ?? '');
    foreach ($open as $t) {
      if ($hint === '' || mb_strpos((string)$t['title'], $hint) !== false) {
        if (($t['status'] ?? '') === 'open') { $actions[] = ['op' => 'complete', 'id' => (int)$t['id']]; break; }
      }
    }
  }

  // update interval on existing
  if (preg_match('/(?:间隔|频率).{0,6}?(?:改成|改为|调整为|换成)\s*每?\s*(\d+)\s*分钟/u', $prompt, $m)
    || preg_match('/改成\s*每\s*(\d+)\s*分钟/u', $prompt, $m2)) {
    $mins = (int)($m[1] ?? ($m2[1] ?? 0));
    if ($mins > 0) {
      foreach ($open as $t) {
        if (($t['cycle_type'] ?? '') === 'interval') {
          $actions[] = ['op' => 'update', 'id' => (int)$t['id'], 'fields' => ['interval_minutes' => $mins]];
          break;
        }
      }
    }
  }

  // update goal amount
  if (preg_match('/(?:目标|总量).{0,6}?(?:改成|改为|调整为|换成)\s*(\d+(?:\.\d+)?)\s*(L|l|升|ml|毫升)/u', $prompt, $m)
    || preg_match('/改成\s*(\d+(?:\.\d+)?)\s*(L|l|升|ml|毫升)/u', $prompt, $m2)) {
    $amount = (float)($m[1] ?? ($m2[1] ?? 0));
    $unitRaw = $m[2] ?? ($m2[2] ?? 'L');
    $unit = in_array(strtolower($unitRaw), ['ml','毫升'], true) ? 'ml' : 'L';
    if ($amount > 0) {
      foreach ($open as $t) {
        if (($t['cycle_type'] ?? '') === 'interval' && ($t['goal_amount'] ?? null)) {
          $actions[] = ['op' => 'update', 'id' => (int)$t['id'], 'fields' => ['goal_amount' => $amount, 'goal_unit' => $unit]];
          break;
        }
      }
    }
  }

  // update window
  if (preg_match('/(\d{1,2})[:点：](\d{0,2}).{0,8}?(?:到|至|-|–).{0,8}?(\d{1,2})[:点：](\d{0,2}).{0,12}?(?:改|调|换成|改为)/u', $prompt, $m)
    || preg_match('/(?:时间|时段|窗口).{0,6}?(?:改成|改为)\s*(\d{1,2})[:点：](\d{0,2}).{0,6}?(?:到|至|-)\s*(\d{1,2})[:点：](\d{0,2})/u', $prompt, $m2)) {
    $src = !empty($m) ? $m : $m2;
    if ($src) {
      $ws = sprintf('%02d:%02d', (int)$src[1], (int)($src[2] !== '' ? $src[2] : 0));
      $we = sprintf('%02d:%02d', (int)$src[3], (int)($src[4] !== '' ? $src[4] : 0));
      foreach ($open as $t) {
        if (($t['cycle_type'] ?? '') === 'interval') {
          $actions[] = ['op' => 'update', 'id' => (int)$t['id'], 'fields' => ['window_start' => $ws, 'window_end' => $we]];
          break;
        }
      }
    }
  }

  // create simple once todo: 加一个待办/新建待办/记一下/提醒我
  $onceTitle = null;
  if (!user_stated_schedule($prompt)) {
    if (preg_match('/(?:加一个|添加一个|新建|新增|加个)\s*待办\s*[:：]?\s*[「「"“]?(.+)$/u', $prompt, $m)) {
      $onceTitle = $m[1];
    } elseif (preg_match('/(?:帮我记一下|提醒我|记一下)\s*[:：]?\s*[「「"“]?(.+)$/u', $prompt, $m)) {
      $onceTitle = $m[1];
    } elseif (preg_match('/加一个\s*[「「"“](.+?)[」」"”]/u', $prompt, $m)) {
      $onceTitle = $m[1];
    }
  }
  if ($onceTitle !== null) {
    $title = trim($onceTitle);
    $title = preg_replace('/^[「「"“]+|[」」"”]+$/u', '', $title);
    $title = preg_replace('/[。！!？?\s]+$/u', '', $title);
    if ($title !== '' && mb_strlen($title) <= 80 && !preg_match('/喝了|进度|间隔|目标/u', $title)) {
      $actions[] = ['op' => 'create', 'todo' => [
        'title' => $title,
        'cycle_type' => 'once',
        'notes' => '',
      ]];
    }
  }

  // reorder: 把X排到最前
  if (preg_match('/把\s*[「「"“]?([^」」"”]{1,40}?)[」」"”]?\s*(?:排到|放到|移到)\s*(最前|上面|第一)/u', $prompt, $m)) {
    $hint = trim($m[1]);
    $ids = [];
    $first = null;
    foreach ($open as $t) {
      if ($first === null && mb_strpos((string)$t['title'], $hint) !== false) {
        $first = (int)$t['id'];
      } else {
        $ids[] = (int)$t['id'];
      }
    }
    if ($first) {
      array_unshift($ids, $first);
      $actions[] = ['op' => 'reorder', 'ids' => $ids];
    }
  }

  // page: 折线图 / 生成页面 / 给我看网页
  if (preg_match('/折线图|曲线图|进度图|可视化|生成(?:一个)?页面|做(?:一个)?页面|给我看|打开页面|报表/u', $prompt)) {
    $slug = 'progress-chart';
    $title = '进度折线图';
    $hint = '水';
    if (preg_match('/喝水|饮水|补水/u', $prompt)) {
      $slug = 'water-progress';
      $title = '喝水进度折线图';
      $hint = '水';
    }
    $todoId = 0;
    foreach ($open as $t) {
      if (mb_strpos((string)$t['title'], $hint) !== false) { $todoId = (int)$t['id']; break; }
    }
    if (!$todoId) {
      foreach ($open as $t) {
        if (($t['cycle_type'] ?? '') === 'interval') { $todoId = (int)$t['id']; break; }
      }
    }
    $actions[] = [
      'op' => 'upsert_page',
      'slug' => $slug,
      'title' => $title,
      'kind' => 'chart_line',
      'spec' => [
        'todo_id' => $todoId ?: null,
        'todo_title_hint' => $hint,
        'title' => $title,
      ],
    ];
  }

  if (preg_match('/(?:删掉|删除)\s*(?:这个|那个)?页面/u', $prompt) && preg_match('/slug[=：:\s]+([a-z0-9\-_]+)/i', $prompt, $m)) {
    $actions[] = ['op' => 'delete_page', 'slug' => $m[1]];
  }

  // 强提醒：加一条强提醒：xxx / 新增强提醒1：yyy
  if (preg_match('/(?:加一条|新增|添加|记下|设置)\s*强提醒\s*(\d+)?\s*[:：]?\s*(.+)$/u', $prompt, $m)
    || preg_match('/强提醒\s*(\d+)\s*[:：]\s*(.+)$/u', $prompt, $m2)) {
    $src = !empty($m) ? $m : $m2;
    $sort = isset($src[1]) && $src[1] !== '' ? (int)$src[1] : null;
    $content = trim($src[2] ?? '');
    $title = '';
    if (preg_match('/^【([^】]+)】\s*(.+)$/u', $content, $tm)) {
      $title = $tm[1];
      $content = $tm[2];
    } elseif (preg_match('/^([^:：]{1,20})[:：]\s*(.+)$/u', $content, $tm)) {
      $title = $tm[1];
      $content = $tm[2];
    }
    if ($content !== '') {
      $actions[] = [
        'op' => 'upsert_reminder',
        'title' => $title,
        'content' => $content,
        'sort_no' => $sort,
      ];
    }
  }

  if (preg_match('/(?:删掉|删除)\s*强提醒\s*#?\s*(\d+)/u', $prompt, $m)) {
    $actions[] = ['op' => 'delete_reminder', 'id' => (int)$m[1]];
  }

  return $actions;
}

function merge_actions(array $primary, array $fallback): array {
  if (!$primary) return $fallback;
  $ops = [];
  foreach ($primary as $a) {
    $ops[strtolower((string)($a['op'] ?? ''))] = true;
  }
  foreach ($fallback as $a) {
    $op = strtolower((string)($a['op'] ?? ''));
    // always allow unique complementary ops; if same op missing amount/fields, skip duplicate
    if (!isset($ops[$op])) {
      $primary[] = $a;
      $ops[$op] = true;
    }
  }
  return $primary;
}

function apply_secretary(PDO $pdo, array $understood, array $open, string $prompt = ''): array {
  $nowOverride = resolve_now_minutes($prompt, null, $pdo);
  $intent = $understood['intent'] ?? 'chat';

  // Hard override: clear progress language → ensure set_progress action exists
  if ($prompt !== '' && user_stated_progress($prompt) && $open) {
    $h = heuristic_progress($prompt);
    if ($h) {
      $actions = legacy_intent_to_actions($understood);
      $hasProgress = false;
      foreach ($actions as $a) {
        $op = strtolower((string)($a['op'] ?? ''));
        if (in_array($op, ['set_progress','update_progress','progress'], true)) { $hasProgress = true; break; }
      }
      if (!$hasProgress) {
        $actions[] = array_merge(['op' => 'set_progress'], $h['progress']);
        $understood['actions'] = $actions;
        $intent = 'act';
      }
    }
  }

  // Force CRUD from clear natural-language even when model returns empty chat
  if ($prompt !== '') {
    $forced = heuristic_secretary_actions($prompt, $open);
    if ($forced) {
      $cur = legacy_intent_to_actions($understood);
      $understood['actions'] = merge_actions($cur, $forced);
      if (($understood['intent'] ?? '') === 'chat' || ($understood['intent'] ?? '') === '') {
        $understood['intent'] = 'act';
        $intent = 'act';
      }
    }
  }

  // Invented create without schedule → chat
  $actions = legacy_intent_to_actions($understood);
  if ($intent === 'create_goal' || $intent === 'create_todo') {
    if ($prompt !== '' && !user_stated_schedule($prompt) && !user_stated_progress($prompt)) {
      return [
        'mode' => $understood['mode'] ?? 'live',
        'intent' => 'chat',
        'summary' => '这句还不像在定目标。请补全：时间段、每隔多久、总量；或直接说要改哪条现有任务。',
        'todos' => enrich_todo_list($open, $nowOverride),
        'actions_applied' => [],
        'ref_time' => $nowOverride !== null ? sprintf('%02d:%02d', intdiv($nowOverride, 60), $nowOverride % 60) : null,
      ];
    }
  }

  if (!$actions) {
    // pure chat (still refresh timeline with logical now)
    return [
      'mode' => $understood['mode'] ?? 'live',
      'intent' => 'chat',
      'summary' => trim((string)($understood['summary'] ?? '在的。')),
      'todos' => enrich_todo_list(load_open_todos($pdo), $nowOverride),
      'actions_applied' => [],
      'ref_time' => $nowOverride !== null ? sprintf('%02d:%02d', intdiv($nowOverride, 60), $nowOverride % 60) : null,
    ];
  }

  // Block invented schedule goals; allow plain once-todos and explicit schedule creates
  $filtered = [];
  foreach ($actions as $a) {
    if (!is_array($a)) continue;
    $op = strtolower((string)($a['op'] ?? $a['action'] ?? ''));
    if (in_array($op, ['create','create_goal','create_todo'], true) && $prompt !== '') {
      $todo = $a['todo'] ?? $a;
      $cycle = $todo['cycle_type'] ?? (isset($todo['interval_minutes']) ? 'interval' : 'once');
      if ($cycle === 'interval' && !user_stated_schedule($prompt)) {
        continue; // skip invented interval goals
      }
      if ($cycle === 'once' && empty($todo['title'])) {
        continue;
      }
    }
    $filtered[] = $a;
  }
  if (!$filtered) {
    return [
      'mode' => $understood['mode'] ?? 'live',
      'intent' => 'chat',
      'summary' => trim((string)($understood['summary'] ?? '我在。要改任务直接说，例如：把喝水间隔改成30分钟。')),
      'todos' => enrich_todo_list(load_open_todos($pdo), $nowOverride),
      'actions_applied' => [],
      'ref_time' => $nowOverride !== null ? sprintf('%02d:%02d', intdiv($nowOverride, 60), $nowOverride % 60) : null,
    ];
  }

  $notes = [];
  $meta = ['page_urls' => [], 'pages' => [], 'reminders' => []];
  foreach ($filtered as $a) {
    $note = execute_secretary_action($pdo, $a, $open, $nowOverride, $prompt, $meta);
    if ($note) $notes[] = $note;
  }

  $todos = enrich_todo_list(load_open_todos($pdo), $nowOverride);
  $summary = trim((string)($understood['summary'] ?? ''));
  // Prefer server-executed notes so we never "嘴上已改、库没动"
  if ($notes) {
    $serverLine = implode('；', $notes);
    if ($summary === '' || mb_strlen($summary) > 120) {
      $summary = $serverLine;
    } else {
      $summary = rtrim($summary, '。') . '。' . $serverLine;
    }
  }
  // Append water/interval calc only when this turn touched progress or schedule fields
  $touchedSchedule = false;
  foreach ($notes as $n) {
    if (preg_match('/已记进度|interval_minutes|window_start|window_end|goal_amount|goal_unit|已隐藏/u', $n)) {
      $touchedSchedule = true;
      break;
    }
  }
  if ($touchedSchedule || user_stated_progress($prompt) || parse_user_now_minutes($prompt) !== null) {
    foreach ($todos as $t) {
      if (($t['cycle_type'] ?? '') === 'interval' && !empty($t['calc']['status_text'])) {
        if (mb_strpos($summary, '剩余') === false && mb_strpos($summary, '每次') === false) {
          $summary .= '。' . $t['calc']['status_text'];
        }
        if ($nowOverride !== null && !empty($t['window_start']) && !empty($t['interval_minutes'])) {
          $start = hm_to_minutes($t['window_start']);
          $interval = (int)$t['interval_minutes'];
          if ($start !== null && $interval > 0 && $nowOverride > $start) {
            $past = (int)floor(($nowOverride - $start) / $interval);
            if ($past > 0 && mb_strpos($summary, '已隐藏') === false) {
              $hh = sprintf('%02d:%02d', intdiv($nowOverride, 60), $nowOverride % 60);
              $summary .= "；按你说的 {$hh}，已隐藏此前 {$past} 个时间点";
            }
          }
        }
        break;
      }
    }
  }

  if (empty($meta['reminders']) && function_exists('reminders_for_prompt')) {
    $meta['reminders'] = reminders_for_prompt($pdo);
  }

  return [
    'mode' => $understood['mode'] ?? 'live',
    'intent' => 'act',
    'summary' => $summary,
    'todos' => $todos,
    'actions_applied' => $notes,
    'pages' => $meta['pages'] ?? [],
    'page_urls' => $meta['page_urls'] ?? [],
    'reminders' => $meta['reminders'] ?? [],
    'ref_time' => $nowOverride !== null ? sprintf('%02d:%02d', intdiv($nowOverride, 60), $nowOverride % 60) : null,
  ];
}
