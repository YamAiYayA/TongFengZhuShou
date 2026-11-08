<?php
/**
 * Page CRUD for the secretary: AI can create/update/delete view pages (charts, reports).
 * User opens the URL the assistant returns — no manual UI building.
 */

function ensure_pages_schema(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS pages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(64) NOT NULL,
    title VARCHAR(120) NOT NULL DEFAULT '',
    kind VARCHAR(32) NOT NULL DEFAULT 'html',
    html_content MEDIUMTEXT NOT NULL,
    spec_json MEDIUMTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (slug)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function sanitize_page_slug(string $slug): string {
  $slug = strtolower(trim($slug));
  $slug = preg_replace('/[^a-z0-9\-_]+/', '-', $slug);
  $slug = trim($slug, '-_');
  if ($slug === '') $slug = 'page-' . substr(md5((string)microtime(true)), 0, 8);
  return mb_substr($slug, 0, 64);
}

function page_public_url(string $slug): string {
  $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'https';
  $host = $_SERVER['HTTP_HOST'] ?? 'api.guoziai.com';
  $base = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/assistant'), '/\\');
  if ($base === '' || $base === '.') $base = '/assistant';
  // page.php lives next to api.php
  if (substr($base, -4) === '/api') $base = substr($base, 0, -4);
  return $scheme . '://' . $host . $base . '/page.php?slug=' . rawurlencode($slug);
}

function list_pages(PDO $pdo): array {
  ensure_pages_schema($pdo);
  return $pdo->query("SELECT id, slug, title, kind, updated_at FROM pages ORDER BY updated_at DESC")->fetchAll();
}

function get_page_by_slug(PDO $pdo, string $slug): ?array {
  ensure_pages_schema($pdo);
  $st = $pdo->prepare('SELECT * FROM pages WHERE slug=? LIMIT 1');
  $st->execute([sanitize_page_slug($slug)]);
  $row = $st->fetch();
  return $row ?: null;
}

function delete_page_by_slug(PDO $pdo, string $slug): bool {
  ensure_pages_schema($pdo);
  $st = $pdo->prepare('DELETE FROM pages WHERE slug=?');
  $st->execute([sanitize_page_slug($slug)]);
  return $st->rowCount() > 0;
}

/**
 * Build a line-chart page for progress_logs of a todo (or all).
 */
function build_progress_line_chart_html(PDO $pdo, array $spec): string {
  $todoId = (int)($spec['todo_id'] ?? 0);
  $title = trim((string)($spec['title'] ?? '进度折线图'));
  if ($title === '') $title = '进度折线图';

  if ($todoId > 0) {
    $st = $pdo->prepare("SELECT amount, unit, note, created_at FROM progress_logs WHERE todo_id=? ORDER BY id ASC");
    $st->execute([$todoId]);
    $logs = $st->fetchAll();
    $todo = $pdo->query('SELECT * FROM todos WHERE id=' . $todoId)->fetch() ?: null;
  } else {
    $logs = $pdo->query("SELECT todo_id, amount, unit, note, created_at FROM progress_logs ORDER BY id ASC LIMIT 200")->fetchAll();
    $todo = null;
  }

  $labels = [];
  $values = [];
  $cum = 0.0;
  $goalUnit = $todo['goal_unit'] ?? 'L';
  foreach ($logs as $log) {
    $amt = (float)$log['amount'];
    $unit = (string)($log['unit'] ?: $goalUnit);
    // normalize to goal unit display (prefer L for water)
    if (strtolower($goalUnit) === 'l' || $goalUnit === '升') {
      if (strtolower($unit) === 'ml' || $unit === '毫升') $amt = $amt / 1000.0;
      $yUnit = 'L';
    } else {
      $yUnit = $unit ?: 'ml';
    }
    $mode = (string)($log['note'] ?? 'set_progress');
    if ($mode === 'add_progress') {
      $cum += $amt;
    } elseif ($mode === 'set_remaining' && $todo) {
      $goal = (float)$todo['goal_amount'];
      $cum = max(0.0, $goal - $amt);
    } else {
      $cum = $amt; // set_progress absolute
    }
    $labels[] = substr((string)$log['created_at'], 5, 11); // mm-dd hh:ii
    $values[] = round($cum, 3);
  }

  $goalLine = ($todo && $todo['goal_amount'] !== null) ? (float)$todo['goal_amount'] : null;
  $sub = $todo
    ? ('任务：' . $todo['title'] . ' · 目标 ' . $todo['goal_amount'] . ($todo['goal_unit'] ?? '') . ' · 当前 ' . $todo['progress_amount'] . ($todo['goal_unit'] ?? ''))
    : ('共 ' . count($logs) . ' 条进度记录');

  $payload = json_encode([
    'labels' => $labels,
    'values' => $values,
    'goal' => $goalLine,
    'yUnit' => $yUnit ?? 'L',
    'title' => $title,
    'sub' => $sub,
  ], JSON_UNESCAPED_UNICODE);

  $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
  $safeSub = htmlspecialchars($sub, ENT_QUOTES, 'UTF-8');

  return <<<HTML
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{$safeTitle}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  :root { --ink:#152018; --moss:#1f6b45; --paper:#f3f6f2; --line:#d5ddd6; }
  body { margin:0; font-family:"Segoe UI","PingFang SC",sans-serif; color:var(--ink);
    background: linear-gradient(180deg,#eef3ec,var(--paper)); min-height:100vh; }
  main { max-width:920px; margin:0 auto; padding:28px 16px 48px; }
  h1 { font-size:28px; margin:0 0 6px; }
  .sub { color:#6b786f; margin-bottom:18px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:16px; padding:16px; }
  canvas { width:100% !important; max-height:420px; }
  .empty { color:#6b786f; padding:40px 12px; text-align:center; }
</style>
</head>
<body>
<main>
  <h1>{$safeTitle}</h1>
  <p class="sub">{$safeSub}</p>
  <div class="card">
    <canvas id="c"></canvas>
    <div id="empty" class="empty" style="display:none">还没有进度数据。先跟助理说「已经喝了xxx」。</div>
  </div>
</main>
<script>
const DATA = {$payload};
const empty = document.getElementById('empty');
const canvas = document.getElementById('c');
if (!DATA.labels.length) {
  canvas.style.display = 'none';
  empty.style.display = 'block';
} else {
  const datasets = [{
    label: '累计进度 (' + DATA.yUnit + ')',
    data: DATA.values,
    borderColor: '#1f6b45',
    backgroundColor: 'rgba(31,107,69,.12)',
    fill: true,
    tension: 0.25,
    pointRadius: 4
  }];
  if (DATA.goal != null) {
    datasets.push({
      label: '目标 (' + DATA.yUnit + ')',
      data: DATA.labels.map(() => DATA.goal),
      borderColor: '#c45c26',
      borderDash: [6,4],
      pointRadius: 0,
      fill: false
    });
  }
  new Chart(canvas, {
    type: 'line',
    data: { labels: DATA.labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } }
    }
  });
}
</script>
</body>
</html>
HTML;
}

/**
 * Build a simple HTML report page from AI-provided body (wrapped in shell).
 */
function build_html_page(string $title, string $bodyHtml): string {
  $safeTitle = htmlspecialchars($title !== '' ? $title : '页面', ENT_QUOTES, 'UTF-8');
  // Allow basic markup from AI; strip php tags hard
  $bodyHtml = str_replace(['<?', '?>'], ['&lt;?', '?&gt;'], $bodyHtml);
  return <<<HTML
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{$safeTitle}</title>
<style>
  body { margin:0; font-family:"Segoe UI","PingFang SC",sans-serif; color:#152018;
    background:linear-gradient(180deg,#eef3ec,#f3f6f2); }
  main { max-width:860px; margin:0 auto; padding:28px 16px 48px; }
  h1 { font-size:28px; margin:0 0 12px; }
  .card { background:#fff; border:1px solid #d5ddd6; border-radius:16px; padding:16px; line-height:1.6; }
</style>
</head>
<body>
<main>
  <h1>{$safeTitle}</h1>
  <div class="card">{$bodyHtml}</div>
</main>
</body>
</html>
HTML;
}

/**
 * Upsert a page. Spec drives generated charts; html overrides when kind=html.
 * Returns [row, url].
 */
function upsert_page(PDO $pdo, array $action, array $openTodos = []): array {
  ensure_pages_schema($pdo);
  $slug = sanitize_page_slug((string)($action['slug'] ?? $action['page_slug'] ?? ''));
  $title = mb_substr(trim((string)($action['title'] ?? '未命名页面')), 0, 120);
  $kind = strtolower(trim((string)($action['kind'] ?? 'html')));
  if (!in_array($kind, ['html', 'chart_line', 'chart'], true)) $kind = 'html';
  if ($kind === 'chart') $kind = 'chart_line';

  $spec = $action['spec'] ?? [];
  if (!is_array($spec)) $spec = [];
  if (empty($spec['title'])) $spec['title'] = $title;

  // Resolve todo_id from hint
  if (empty($spec['todo_id']) && !empty($spec['todo_title_hint'])) {
    $hint = (string)$spec['todo_title_hint'];
    foreach ($openTodos as $t) {
      if (mb_strpos((string)$t['title'], $hint) !== false) {
        $spec['todo_id'] = (int)$t['id'];
        break;
      }
    }
  }
  if (empty($spec['todo_id'])) {
    foreach ($openTodos as $t) {
      if (($t['cycle_type'] ?? '') === 'interval' && ($t['goal_amount'] ?? null)) {
        $spec['todo_id'] = (int)$t['id'];
        break;
      }
    }
  }

  if ($kind === 'chart_line') {
    $html = build_progress_line_chart_html($pdo, $spec);
  } else {
    $body = (string)($action['html'] ?? $action['body'] ?? $action['content'] ?? '');
    if (trim($body) === '') {
      $body = '<p>空页面。让助理再改一版内容。</p>';
    }
    $html = build_html_page($title, $body);
  }

  if (mb_strlen($html) > 500000) {
    throw new RuntimeException('页面内容过大');
  }

  $specJson = json_encode($spec, JSON_UNESCAPED_UNICODE);
  $existing = get_page_by_slug($pdo, $slug);
  if ($existing) {
    $pdo->prepare('UPDATE pages SET title=?, kind=?, html_content=?, spec_json=? WHERE slug=?')
      ->execute([$title, $kind, $html, $specJson, $slug]);
  } else {
    if ($slug === '' || $slug === sanitize_page_slug('')) {
      $slug = sanitize_page_slug(preg_replace('/\s+/', '-', $title));
    }
    $pdo->prepare('INSERT INTO pages (slug, title, kind, html_content, spec_json) VALUES (?,?,?,?,?)')
      ->execute([$slug, $title, $kind, $html, $specJson]);
  }
  $row = get_page_by_slug($pdo, $slug);
  $url = page_public_url($slug);
  return [$row, $url];
}

/** Refresh chart pages that bind to a todo after progress changes. */
function refresh_bound_chart_pages(PDO $pdo, int $todoId): void {
  ensure_pages_schema($pdo);
  $rows = $pdo->query("SELECT * FROM pages WHERE kind='chart_line'")->fetchAll();
  foreach ($rows as $row) {
    $spec = json_decode((string)($row['spec_json'] ?? '{}'), true) ?: [];
    if ((int)($spec['todo_id'] ?? 0) !== $todoId) continue;
    $html = build_progress_line_chart_html($pdo, $spec);
    $pdo->prepare('UPDATE pages SET html_content=? WHERE id=?')->execute([$html, $row['id']]);
  }
}
