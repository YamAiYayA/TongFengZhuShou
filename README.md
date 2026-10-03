# 痛风喝水助手（第一版）

本地优先的喝水提醒工具：目标总量、起床/截止时间、主动记录、提醒响应（延后 / 已喝）、动态间隔对照、系统通知（可同步小米手环震动）。

吃药模块与历史统计后续再做。

## 第一版范围

- 设置：每日目标、起床时间、截止时间（默认 21:00）、常用毫升按钮、通知开关
- 第一杯：起床后若无记录则提醒；第一次喝水自动作为今日数据起点
- 记录 CRUD：主动记录 / 提醒后记录，支持改、删
- 提醒响应：稍等一会儿（选自选延后）或已经喝了（多久前、喝多少、下次多久提醒）
- 动态对照：按 5/10/15/20/30 分钟展示剩余次数与每次约需量（不做推荐间隔）
- 进度：已喝/余量、时间进度%、水量进度%、四档状态
- 存储：本地 SQLite；表结构见 `docs/mysql-schema.sql`，便于以后同步到服务器 MySQL

## 默认规则（验收用）

1. 清醒时间窗：设置的起床时间 → 截止时间
2. 主动记录后：可选手动设置「下次提醒分钟」；不设置则不自动按间隔连环提醒（仍保留起床第一杯逻辑）
3. 截止后：不再因未达标催促

## 开发

```bash
npm install
npm run start
```

## 验收 APK

云端构建产物（ARM）：安装包见 artifacts / 本机构建输出。

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
```

输出：`android/app/build/outputs/apk/release/app-release.apk`

## 打 Android 包


```bash
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
```

APK 输出：

`android/app/build/outputs/apk/debug/app-debug.apk`

安装后请允许通知权限，并在小米运动/手环 App 中打开对本应用的通知同步。

## 技术栈

- Expo (React Native) + TypeScript
- expo-sqlite（本地）
- expo-notifications（系统通知）
