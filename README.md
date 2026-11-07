# 助理 · 周期待办

Web 优先的个人助理：待办 + 时间周期 + DeepSeek 自然语言解析。

## 本地开发

```bash
npm install
npm run dev
```

打开 http://127.0.0.1:3000

## 密钥

服务端读取 `DEEPSEEK_API_KEY`（切勿写入仓库或前端）。未配置时 AI 走示例模式。

发布到 Cursor 时通过 Secrets 绑定同名变量。
