# 私人秘书助理（人 ↔ AI ↔ 数据库）

人只负责说话；助理通过 `actions` 对 `todos` 做增删改查、排序、改时间窗/间隔/目标、记进度。

线上目录：宝塔站点 `api.guoziai.com/assistant`（FTP 部署 PHP）。

## 能力
- `create` / `update` / `delete` / `complete` / `reopen` / `archive`
- `set_progress`（含逻辑时钟「现在12点」测试）
- `reorder`
- 服务端启发式兜底：模型只聊天不给 actions 时，仍按中文指令落库

## 本地配置
用环境变量或改 `config.php`：`ASSISTANT_DB_*`、`DEEPSEEK_API_KEY`。
