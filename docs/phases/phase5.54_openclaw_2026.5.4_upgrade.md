# Phase 5.54: 内置 OpenClaw 升级到 v2026.5.4

> 状态：规划完成，待实现
> 类型：后端安装链路升级
> 前置阶段：Phase 5.17 / Phase 5.33 / Phase 5.39

## 目标

将 DragonClaw 内置 OpenClaw 引擎的锁定版本从 `v2026.4.27` 升级到上游 GitHub Release `v2026.5.4`，并保留现有“版本不匹配自动重装”的安装体验。

本次任务以“升级并修到可用”为目标，不修改 DragonClaw 自身版本号，也不改任何前端 `invoke()` 契约、Rust command 签名或统一路径约定。

## 版本来源

- 上游仓库：`openclaw/openclaw`
- 目标 release tag：`v2026.5.4`
- 核对时间：`2026-05-06`
- 发布日期：`2026-05-05`
- 参考 release：
  - `v2026.5.4`：<https://github.com/openclaw/openclaw/releases/tag/v2026.5.4>
  - `v2026.4.27`：<https://github.com/openclaw/openclaw/releases/tag/v2026.4.27>

## 背景与风险

- 当前项目通过 `src-tauri/src/download.rs` 中的 `PINNED_VERSION` 固定 OpenClaw 版本，并在安装后写入 `.openclaw_version` 标记文件。
- Phase 5.17 已补过一轮新版源码包兼容：上游 source archive 不再稳定自带 CLI 构建产物，因此安装链路需要在 `pnpm install` 后按需执行 `pnpm build`。
- Phase 5.33 / Phase 5.39 已补过一轮 gateway 真相修复：DragonClaw 当前依赖 `127.0.0.1` 本地探针、RPC ready 校验和真实 token 读取来判断网关是否可用。
- 上游 `v2026.5.4` 的 release notes 明确提到 Windows 下 loopback gateway 默认只绑定 `127.0.0.1`。因此这次升级不能只改版本字符串，必须验证安装链路、gateway 启动、Control UI 打开和首页聊天真实收发是否仍然成立。

## 本次范围

- 更新 `src-tauri/src/download.rs` 中的 OpenClaw 锁定版本与相关 release 注释。
- 保持 `.openclaw_version` 判定旧安装是否需要重下载的契约不变。
- 复核 `installer.rs` 中 `has_cli_build_output()`、条件 `pnpm build` 与 `setup.rs` 中 `check_node_modules_exists()` 的行为，确认仍适配 `v2026.5.4`。
- 回归验证本地 gateway 启动、RPC ready 校验、Control UI 打开和首页聊天链路。
- 若 `v2026.5.4` 带来新的安装/启动兼容问题，在现有后端实现边界内补齐，不改外部命令契约。

## 不包含

- 不升级 DragonClaw 自身版本号。
- 不调整 `#[tauri::command]` 名称、参数或返回类型。
- 不修改前端 `invoke()` 调用名、payload 结构和返回类型。
- 不改 `paths::engine_dir()`、`paths::user_config_dir()` 等统一路径约定。
- 不顺手混入 UI 重构、无关功能开发或安装链路扩张。

## 关键实现

### 1. 版本锁定升级

- 将 `PINNED_VERSION` 从 `v2026.4.27` 升级到 `v2026.5.4`。
- 同步更新 `download.rs` 注释中的版本说明和 release 链接。
- 保持 GitHub 主链接与镜像回退下载逻辑不变。

### 2. 旧安装自动重装

- 保持 `needs_download()` 的行为不变。
- 现有旧安装若 `.openclaw_version` 不匹配，应自动删除旧引擎目录并重新安装新版本。
- 新版本安装完成后继续写入 `.openclaw_version`。

### 3. 安装链路兼容校验

- 保留 `pnpm install` 后按需执行 `pnpm build` 的逻辑。
- 确认 `has_cli_build_output()` 对 `dist/entry.js` / `dist/entry.mjs` 的判定仍覆盖 `v2026.5.4`。
- 若上游构建产物路径再次变化，只允许做最小检测修正，不扩大安装器职责。

### 4. Gateway / Runtime 回归

- 保留 `127.0.0.1` 本地端口探测、WebSocket URL、RPC ready 校验和 Control UI 打开方式。
- 验证 `v2026.5.4` 在 Windows 下仍可通过现有 `127.0.0.1` 链路完成 gateway 启动与状态探测。
- 若出现新的配置或启动兼容问题，在既有后端安装/启动链路内修复，不更改前端协议。

## 验收标准

- `src-tauri/src/download.rs` 中锁定版本更新为 `v2026.5.4`。
- 文档 commit 与代码 commit 分开提交。
- 旧安装在版本不匹配时会自动重装，且 `.openclaw_version` 最终写入 `v2026.5.4`。
- 全新安装可完成下载、解压、依赖安装、必要时 `pnpm build` 与默认配置注入。
- 启动服务后，本地 gateway 能通过现有 `127.0.0.1` / token / RPC 校验链路进入 ready。
- Control UI 可正常打开。
- 首页聊天入口至少完成一次真实消息收发。

## 验证

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run tauri dev`
- 手动验证旧安装升级链路：准备带旧 `.openclaw_version` 的引擎目录，确认自动触发删除旧版本并升级到 `v2026.5.4`
- 手动验证全新安装链路：删除引擎目录后重新安装，确认下载、解压、依赖安装、默认配置注入与服务启动可用
- 手动验证 runtime：打开 Control UI，并在首页聊天完成至少一次真实收发
