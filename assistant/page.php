<?php
date_default_timezone_set('Asia/Shanghai');
require __DIR__ . '/db.php';
require __DIR__ . '/pages.php';

$slug = isset($_GET['slug']) ? (string)$_GET['slug'] : '';
if ($slug === '') {
  http_response_code(400);
  header('Content-Type: text/plain; charset=utf-8');
  echo '缺少 slug';
  exit;
}

try {
  $pdo = db();
  ensure_schema($pdo);
  ensure_pages_schema($pdo);
  $page = get_page_by_slug($pdo, $slug);
  if (!$page) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><meta charset="utf-8"><title>页面不存在</title><body style="font-family:sans-serif;padding:40px">页面不存在或已被助理删除。</body>';
    exit;
  }
  header('Content-Type: text/html; charset=utf-8');
  header('Cache-Control: no-store');
  echo $page['html_content'];
} catch (Throwable $e) {
  http_response_code(500);
  header('Content-Type: text/plain; charset=utf-8');
  echo '页面加载失败：' . $e->getMessage();
}
