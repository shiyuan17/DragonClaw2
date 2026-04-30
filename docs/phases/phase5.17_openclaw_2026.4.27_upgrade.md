# Phase 5.17: 内置 OpenClaw 升级到 v2026.4.27

> 状态：规划中
> 类型：后端安装链路升级
> 前置阶段：Phase 5.7 / Phase 5.15

## 目标

将 DragonClaw 内置 OpenClaw 引擎的锁定版本从 `v2026.2.6-1` 升级到上游 GitHub Release `v2026.4.27`，并保留现有“版本不匹配自动重装”的安装体验。

本次任务只升级内置引擎 pin，不修改 DragonClaw 自身版本号，也不改任何前端 `invoke()` 契约、Rust command 签名或路径约定。

## 版本来源

- 上游仓库：`openclaw/openclaw`
- 目标 release tag：`v2026.4.27`
- 核对时间：`2026-04-30`
- 发布日期：`2026-04-29`

## 背景与风险

- 当前项目通过 `src-tauri/src/download.rs` 中的 `PINNED_VERSION` 固定 OpenClaw 版本，并在安装后写入 `.openclaw_version` 标记文件。
- 历史上，OpenClaw `v2026.2.19+` 曾引入 device identity 强制链路，导致 Launcher 的本地 gateway WebSocket 连接被拒绝。
- 因此这次升级不能只停留在“能下载下来”，必须回归真实安装、服务启动、gateway 握手和首页聊天链路，确认没有再次出现 token mismatch、WebSocket 拒绝或无法收发消息的问题。

## 本次范围

- 更新 `src-tauri/src/download.rs` 中的 OpenClaw 锁定版本与相关注释
- 继续沿用 `.openclaw_version` 判定旧安装是否需要重下载
- 验证旧版本安装可自动触发重装到 `v2026.4.27`
- 验证全新安装、默认配置注入、服务启动和首页聊天链路可用

## 不包含

- 不升级 DragonClaw 自身版本号
- 不调整 `#[tauri::command]` 名称、参数或返回类型
- 不修改前端 `invoke()` 调用名、payload 结构和返回类型
- 不改 `paths::engine_dir()`、`paths::user_config_dir()` 等统一路径约定
- 不顺手混入 UI 重构、无关功能开发或安装链路大改

## 关键实现

### 1. 版本锁定升级

- 将 `PINNED_VERSION` 从 `v2026.2.6-1` 升级到 `v2026.4.27`
- 同步更新 `download.rs` 注释中的版本说明和 release 链接
- 保持 GitHub 主链接与镜像回退下载逻辑不变

### 2. 旧安装自动迁移

- 保持 `needs_download()` 的行为不变
- 现有旧安装若 `.openclaw_version` 不匹配，应自动删除旧引擎目录并重新安装新版本
- 新版本安装完成后继续写入 `.openclaw_version`

### 3. 回归验证

- 启动 `npm run tauri dev`，确认应用能正常起来
- 验证旧版本安装会触发升级到 `v2026.4.27`
- 验证删除引擎目录后的全新安装仍可完整走通
- 验证服务启动、gateway 握手、首页聊天至少一次真实收发不回归

## 验收标准

- `src-tauri/src/download.rs` 中锁定版本更新为 `v2026.4.27`
- 文档 commit 与代码 commit 分开提交
- 旧安装在版本不匹配时会自动重装，且 `.openclaw_version` 最终写入 `v2026.4.27`
- 全新安装可完成下载、解压、依赖安装和默认配置注入
- 启动服务后，本地 gateway 不出现 device identity / token mismatch / WebSocket 拒绝问题
- 首页聊天入口至少完成一次真实消息收发
- 现有 `~/.openclaw/openclaw.json` 可继续使用，且不误覆盖 `models`、`agents`、`gateway` 既有配置
