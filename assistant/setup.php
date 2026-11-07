<?php
header('Content-Type: text/html; charset=utf-8');
require __DIR__ . '/db.php';
try {
  ensure_schema(db());
  echo '<!doctype html><meta charset="utf-8"><title>建表成功</title>';
  echo '<p style="font-family:sans-serif;padding:24px">数据库表已就绪。请打开 <a href="./">首页</a>。</p>';
} catch (Throwable $e) {
  http_response_code(500);
  echo '<pre style="color:#b00020;padding:24px">建表失败：' . htmlspecialchars($e->getMessage()) . '</pre>';
}
