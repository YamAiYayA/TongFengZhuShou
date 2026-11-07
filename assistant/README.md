# 私人秘书助理：人 ↔ AI ↔（数据库 + 页面）

## 两种权限
1. **数据 CRUD**：todos 增删改查、排序、改间隔/时间窗/目标、记进度  
2. **页面 CRUD**：生成/更新/删除展示页（折线图、报表、说明页），返回 URL 给人打开

## 页面
- 入口：`page.php?slug=water-progress`
- 操作：`upsert_page` / `delete_page` / `list_pages`
- 图表页在进度更新后自动刷新绑定数据

## 线上
宝塔 `api.guoziai.com/assistant`（FTP 部署）
