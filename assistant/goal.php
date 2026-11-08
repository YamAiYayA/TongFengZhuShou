<?php
date_default_timezone_set('Asia/Shanghai');
/** Convert amount to a base unit for math. Water defaults to ml. */
function to_base_amount(float $amount, string $unit): array {
  $u = strtolower(trim($unit));
  if ($u === 'l' || $u === '升') {
    return [$amount * 1000.0, 'ml'];
  }
  if ($u === 'ml' || $u === '') {
    return [$amount, 'ml'];
  }
  // generic countable units stay as-is
  return [$amount, $unit !== '' ? $unit : '次'];
}

function from_base_amount(float $base, string $baseUnit, string $preferUnit): array {
  $p = strtolower(trim($preferUnit));
  if (($p === 'l' || $p === '升') && $baseUnit === 'ml') {
    return [round($base / 1000, 3), 'L'];
  }
  if ($baseUnit === 'ml') {
    return [round($base, 1), 'ml'];
  }
  return [round($base, 2), $preferUnit ?: $baseUnit];
}

function hm_to_minutes(string $hm): ?int {
  if (!preg_match('/^(\d{1,2}):(\d{2})$/', trim($hm), $m)) return null;
  $h = (int)$m[1];
  $min = (int)$m[2];
  if ($h < 0 || $h > 23 || $min < 0 || $min > 59) return null;
  return $h * 60 + $min;
}

function remaining_slots(?string $windowStart, ?string $windowEnd, ?int $intervalMinutes, ?DateTimeInterface $now = null): int {
  if (!$windowStart || !$windowEnd || !$intervalMinutes || $intervalMinutes < 1) return 0;
  $start = hm_to_minutes($windowStart);
  $end = hm_to_minutes($windowEnd);
  if ($start === null || $end === null || $end <= $start) return 0;

  $now = $now ?? new DateTimeImmutable('now');
  $nowMin = ((int)$now->format('G')) * 60 + (int)$now->format('i');

  // before window: full day slots
  if ($nowMin < $start) {
    return (int)floor(($end - $start) / $intervalMinutes);
  }
  // after window: 0 left today
  if ($nowMin >= $end) {
    return 0;
  }
  return max(0, (int)floor(($end - $nowMin) / $intervalMinutes));
}

function total_slots(?string $windowStart, ?string $windowEnd, ?int $intervalMinutes): int {
  if (!$windowStart || !$windowEnd || !$intervalMinutes || $intervalMinutes < 1) return 0;
  $start = hm_to_minutes($windowStart);
  $end = hm_to_minutes($windowEnd);
  if ($start === null || $end === null || $end <= $start) return 0;
  return (int)floor(($end - $start) / $intervalMinutes);
}

/**
 * Recalculate suggested amount per remaining interval.
 * Uses remaining goal / remaining slots (at least 1 if still in window with leftover goal).
 */
function recalculate_per_interval(array $todo, ?DateTimeInterface $now = null): array {
  $goal = (float)($todo['goal_amount'] ?? 0);
  $unit = (string)($todo['goal_unit'] ?? '');
  $progress = (float)($todo['progress_amount'] ?? 0);
  if ($goal <= 0) {
    return [
      'remaining_amount' => null,
      'remaining_slots' => null,
      'per_interval_amount' => null,
      'per_interval_display' => null,
      'status_text' => '无总量目标',
    ];
  }

  [$goalBase, $baseUnit] = to_base_amount($goal, $unit);
  [$progressBase] = to_base_amount($progress, $unit);
  $remainBase = max(0.0, $goalBase - $progressBase);

  $slots = remaining_slots(
    $todo['window_start'] ?? null,
    $todo['window_end'] ?? null,
    isset($todo['interval_minutes']) ? (int)$todo['interval_minutes'] : null,
    $now
  );

  if ($remainBase <= 0) {
    [$disp, $u] = from_base_amount(0, $baseUnit, $unit);
    return [
      'remaining_amount' => $disp,
      'remaining_unit' => $u,
      'remaining_slots' => $slots,
      'per_interval_amount' => 0,
      'per_interval_display' => '0' . $u,
      'status_text' => '今日目标已完成',
    ];
  }

  if ($slots <= 0) {
    [$disp, $u] = from_base_amount($remainBase, $baseUnit, $unit);
    return [
      'remaining_amount' => $disp,
      'remaining_unit' => $u,
      'remaining_slots' => 0,
      'per_interval_amount' => null,
      'per_interval_display' => null,
      'status_text' => '时间窗已结束，还差 ' . $disp . $u,
    ];
  }

  $perBase = $remainBase / $slots;
  // 展示：小于 1L 时改用 ml，更好读
  if ($baseUnit === 'ml') {
    $perDisp = round($perBase);
    $remainDisp = round($remainBase);
    if (strtolower($unit) === 'l' || $unit === '升') {
      $remainShow = rtrim(rtrim(number_format($remainBase / 1000, 3, '.', ''), '0'), '.') . 'L';
    } else {
      $remainShow = $remainDisp . 'ml';
    }
    $perShow = $perDisp . 'ml';
    $perOut = $perDisp;
    $u = 'ml';
  } else {
    [$perDisp, $u] = from_base_amount($perBase, $baseUnit, $unit);
    [$remainDisp] = from_base_amount($remainBase, $baseUnit, $unit);
    $remainShow = rtrim(rtrim(number_format($remainDisp, 3, '.', ''), '0'), '.') . $u;
    $perShow = rtrim(rtrim(number_format($perDisp, 3, '.', ''), '0'), '.') . $u;
    $perOut = $perDisp;
  }

  return [
    'remaining_amount' => $remainDisp,
    'remaining_unit' => $u,
    'remaining_slots' => $slots,
    'per_interval_amount' => $perOut,
    'per_interval_display' => $perShow,
    'status_text' => '剩余 ' . $remainShow . ' · 约 ' . $slots . ' 次 · 每次约 ' . $perShow,
  ];
}

function enrich_todo_row(array $todo, ?int $nowOverrideMin = null): array {
  $now = new DateTimeImmutable('now');
  if ($nowOverrideMin !== null) {
    $h = intdiv($nowOverrideMin, 60);
    $m = $nowOverrideMin % 60;
    $now = $now->setTime($h, $m, 0);
  }
  $calc = recalculate_per_interval($todo, $now);
  $todo['calc'] = $calc;
  if ($calc['per_interval_amount'] !== null) {
    $todo['per_interval_amount'] = $calc['per_interval_amount'];
  }
  $total = total_slots($todo['window_start'] ?? null, $todo['window_end'] ?? null, isset($todo['interval_minutes']) ? (int)$todo['interval_minutes'] : null);
  $todo['total_slots'] = $total;
  $todo['timeline'] = build_timeline($todo, $now, $nowOverrideMin, true);
  $todo['ref_time'] = sprintf('%02d:%02d', intdiv(current_minutes($now, $nowOverrideMin), 60), current_minutes($now, $nowOverrideMin) % 60);
  return $todo;
}



/** Parse "现在12点/中午12:00" from user text; returns minutes from 00:00 or null. */
function parse_user_now_minutes(?string $text): ?int {
  if (!$text) return null;
  // 中午/下午等 + 数字点
  if (preg_match('/(凌晨|早上|上午|中午|下午|晚上|傍晚)\s*(\d{1,2})\s*[:点：]\s*(\d{1,2})?/u', $text, $m)) {
    $h = (int)$m[2];
    $min = isset($m[3]) && $m[3] !== '' ? (int)$m[3] : 0;
    $period = $m[1];
    if ($period === '下午' || $period === '晚上' || $period === '傍晚') {
      if ($h < 12) $h += 12;
    } elseif ($period === '中午' && $h <= 12) {
      $h = $h === 12 ? 12 : ($h < 12 ? 12 : $h);
      if ($h < 12) $h = 12;
    } elseif ($period === '凌晨' && $h === 12) {
      $h = 0;
    }
    if ($h >= 0 && $h <= 23 && $min >= 0 && $min <= 59) return $h * 60 + $min;
  }
  if (preg_match('/现在\s*(凌晨|早上|上午|中午|下午|晚上|傍晚)?\s*(\d{1,2})\s*[:点：]\s*(\d{1,2})?/u', $text, $m)
    || preg_match('/(?<!每)(\d{1,2})\s*[:点：]\s*(\d{2})?\s*了/u', $text, $m2)) {
    if (!empty($m)) {
      $h = (int)$m[2];
      $min = isset($m[3]) && $m[3] !== '' ? (int)$m[3] : 0;
      $period = $m[1] ?? '';
      if ($period === '下午' || $period === '晚上' || $period === '傍晚') {
        if ($h < 12) $h += 12;
      } elseif ($period === '中午' && $h < 12) {
        $h = 12;
      } elseif ($period === '凌晨' && $h === 12) {
        $h = 0;
      }
    } else {
      $h = (int)$m2[1];
      $min = isset($m2[2]) && $m2[2] !== '' ? (int)$m2[2] : 0;
    }
    if ($h >= 0 && $h <= 23 && $min >= 0 && $min <= 59) return $h * 60 + $min;
  }
  if (preg_match('/现在\s*(中午)?\s*(\d{1,2})\s*点(?!\s*到)/u', $text, $m)) {
    $h = (int)$m[2];
    if (($m[1] ?? '') === '中午' && $h < 12) $h = 12;
    if ($h >= 0 && $h <= 23) return $h * 60;
  }
  return null;
}

/** Minutes-of-day used as the user's stated clock for timeline (persisted). */
function get_logical_now_minutes(PDO $pdo): ?int {
  try {
    $v = $pdo->query("SELECT v FROM app_meta WHERE k='logical_now' LIMIT 1")->fetchColumn();
    if ($v === false || $v === null || $v === '') return null;
    $n = (int)$v;
    return ($n >= 0 && $n < 24 * 60) ? $n : null;
  } catch (Throwable $e) {
    return null;
  }
}

function set_logical_now_minutes(PDO $pdo, ?int $minutes): void {
  if ($minutes === null) return;
  $minutes = max(0, min(24 * 60 - 1, $minutes));
  $pdo->prepare("INSERT INTO app_meta (k, v) VALUES ('logical_now', ?)
    ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([(string)$minutes]);
}

/** Resolve effective "now": explicit override > user text > stored logical > wall clock. */
function resolve_now_minutes(?string $prompt, ?int $explicit = null, ?PDO $pdo = null): ?int {
  if ($explicit !== null) return $explicit;
  $fromText = parse_user_now_minutes($prompt);
  if ($fromText !== null) {
    if ($pdo) set_logical_now_minutes($pdo, $fromText);
    return $fromText;
  }
  if ($pdo) return get_logical_now_minutes($pdo);
  return null;
}

/** Clock payload injected into every LLM turn (always). */
function clock_context_for_llm(?PDO $pdo = null, ?string $prompt = null): array {
  $now = new DateTimeImmutable('now');
  $weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  $wallMin = ((int)$now->format('G')) * 60 + (int)$now->format('i');
  $stated = parse_user_now_minutes($prompt);
  $logical = null;
  if ($pdo) {
    try { $logical = get_logical_now_minutes($pdo); } catch (Throwable $e) { $logical = null; }
  }
  $effectiveMin = $stated !== null ? $stated : ($logical !== null ? $logical : $wallMin);
  $effH = intdiv($effectiveMin, 60);
  $effM = $effectiveMin % 60;
  $source = $stated !== null ? 'user_stated' : ($logical !== null ? 'logical_test' : 'wall_clock');

  return [
    'timezone' => date_default_timezone_get() ?: 'Asia/Shanghai',
    'wall_datetime' => $now->format('Y-m-d H:i:s'),
    'wall_date' => $now->format('Y-m-d'),
    'wall_weekday' => '周' . $weekdays[(int)$now->format('w')],
    'wall_time' => $now->format('H:i'),
    'effective_time' => sprintf('%02d:%02d', $effH, $effM),
    'effective_source' => $source,
    'logical_time' => $logical !== null ? sprintf('%02d:%02d', intdiv($logical, 60), $logical % 60) : null,
    'user_stated_time' => $stated !== null ? sprintf('%02d:%02d', intdiv($stated, 60), $stated % 60) : null,
    'note' => '调度/剩余次数默认按 effective_time；用户本轮说「现在X点」则以 user_stated 为准并写入逻辑时钟。',
  ];
}

function current_minutes(?DateTimeInterface $now = null, ?int $overrideMin = null): int {
  if ($overrideMin !== null) return $overrideMin;
  $now = $now ?? new DateTimeImmutable('now');
  return ((int)$now->format('G')) * 60 + (int)$now->format('i');
}

function build_timeline(array $todo, ?DateTimeInterface $now = null, ?int $nowOverrideMin = null, bool $hidePast = true): array {
  $now = $now ?? new DateTimeImmutable('now');
  $interval = isset($todo['interval_minutes']) ? (int)$todo['interval_minutes'] : 0;
  $startHm = $todo['window_start'] ?? null;
  $endHm = $todo['window_end'] ?? null;
  if ($interval < 1 || !$startHm || !$endHm) return [];

  $startMin = hm_to_minutes($startHm);
  $endMin = hm_to_minutes($endHm);
  if ($startMin === null || $endMin === null || $endMin <= $startMin) return [];

  $nowMin = current_minutes($now, $nowOverrideMin);
  $calc = recalculate_per_interval($todo, $now);
  $perDisplay = $calc['per_interval_display'] ?? null;
  $perAmount = $calc['per_interval_amount'];
  $unit = $calc['remaining_unit'] ?? ($todo['goal_unit'] ?? '');

  // For past slots use original equal split of full goal; remaining slots use recalculated per
  $totalSlots = total_slots($startHm, $endHm, $interval);
  $goal = (float)($todo['goal_amount'] ?? 0);
  $gUnit = (string)($todo['goal_unit'] ?? '');
  $origPerDisplay = null;
  if ($goal > 0 && $totalSlots > 0) {
    [$goalBase, $baseUnit] = to_base_amount($goal, $gUnit);
    $origPerBase = $goalBase / $totalSlots;
    if ($baseUnit === 'ml') {
      $origPerDisplay = round($origPerBase) . 'ml';
    } else {
      [$d, $u] = from_base_amount($origPerBase, $baseUnit, $gUnit);
      $origPerDisplay = rtrim(rtrim(number_format($d, 3, '.', ''), '0'), '.') . $u;
    }
  }

  $slots = [];
  $idx = 0;
  for ($m = $startMin; $m < $endMin; $m += $interval) {
    $hh = str_pad((string)intdiv($m, 60), 2, '0', STR_PAD_LEFT);
    $mm = str_pad((string)($m % 60), 2, '0', STR_PAD_LEFT);
    $time = $hh . ':' . $mm;
    $slotEnd = $m + $interval;
    if ($nowMin >= $slotEnd) {
      $state = 'past';
    } elseif ($nowMin >= $m && $nowMin < $slotEnd) {
      $state = 'current';
    } else {
      $state = 'upcoming';
    }

    // Amount: upcoming/current use live recalculated; past show original plan amount
    if ($state === 'past') {
      $amountText = $origPerDisplay;
    } else {
      $amountText = $perDisplay ?: $origPerDisplay;
    }

    if ($hidePast && $state === 'past') {
      continue; // 已过时间点不再展示
    }

    $slots[] = [
      'index' => $idx,
      'time' => $time,
      'state' => $state,
      'title' => (string)($todo['title'] ?? '待办'),
      'amount_text' => $amountText,
      'action' => trim(((string)($todo['title'] ?? '')) . ($amountText ? (' · ' . $amountText) : '')),
    ];
    $idx++;
  }
  return $slots;
}
