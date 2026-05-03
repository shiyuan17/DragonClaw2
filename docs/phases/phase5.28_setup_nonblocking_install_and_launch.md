# Phase 5.28: 引导安装与启动链路去阻塞化
> 状态: Implemented
> 日期: 2026-05-03
> 类型: 后端性能 / 交互稳定性修复

## 背景

当前引导流程在 `checking -> initializing -> launching -> ready` 主链路上会执行多段重型本地任务：

- `setup_openclaw()` 里串行执行 Node 下载、OpenClaw 源码下载、ZIP 解压、`pnpm install`、构建产物补建与 CLI PATH 暴露。
- `start_service_silent()` 启动前会同步检查并预构建 Control UI，首次缺产物时还会额外跑 `npm install` 与 `vite build`。
- onboarding 收尾阶段会继续串行执行 SkillHub 官方安装器、推荐技能安装和 GitHub 技能安装。

这些逻辑虽然挂在 async Tauri command 上，但内部大量直接调用了同步文件 I/O、`Command::output()`、ZIP 解压和大目录删除，导致窗口在引导期间容易出现“未响应”、拖动和点击失效的体感卡死。

## 目标

- 修复首次安装、首次启动服务、首次 onboarding 技能安装期间的界面卡死问题。
- 保持现有前端 `invoke()` 命令名、参数、返回结构与引导页 UI 不变。
- 保持现有 `setup-progress` / `service-log` 事件协议不变，只调整后端执行模型。

## 本次范围

### 1. setup 安装链路去阻塞

- 保留 `setup_openclaw()` 当前时序。
- 将以下重型步骤迁移到 `tokio::task::spawn_blocking` 或等价异步执行路径中：
  - Node 运行时解压与落盘
  - OpenClaw 源码 ZIP 解压、旧版本目录清理、目录替换、版本标记写入
  - `pnpm install` / 重试 / `pnpm build`
  - `ensure_openclaw_cli_available()` 内部的 PATH 写入与 shim 落盘

### 2. launching 启动前预构建去阻塞

- 将 `service.rs` 中的 `ensure_control_ui_built()` 改为异步等待的后台 blocking worker。
- 保持当前“缺产物时自动补依赖并构建”的行为与日志语义不变。
- 已有服务复用优先于 Control UI 预构建，避免复用场景被缺失产物额外阻塞。
- 启动服务命令继续等待这一步完成，但不再占住 UI 相关命令线程，并在 60 秒内轮询确认服务 ready。

### 3. onboarding 安装链路去阻塞

- 保持以下命令的前端契约不变：
  - `install_official_skillhub`
  - `install_skillhub_recommended_skill`
  - `install_github_skill_from_url`
- 将内部 bash / npm / 本地校验逻辑移入 blocking worker，继续串行执行，但避免卡住窗口。
- 服务 ready 后立即进入主界面；推荐技能安装改为后台补全，仅写入日志和 onboarding 状态。
- 为重型子进程增加超时：`pnpm install` 20 分钟、Control UI install/build 10 分钟、官方 SkillHub 5 分钟、单个 SkillHub 技能 3 分钟、单个 GitHub 技能 5 分钟。
- Node 与 OpenClaw 下载流使用异步文件写入，解压和大目录替换继续放在 blocking worker。

## 约束

- 不改任何 `#[tauri::command]` 的前端调用名、参数名与返回类型。
- 不修改 `SetupWizard` 结构、样式和按钮布局。
- 不回滚当前工作区内已有的其他未提交前端改动。
- 不新增取消安装或新的引导阶段；推荐技能补全只作为启动后的后台任务运行。

## 验收标准

- 全新环境首次启动时，下载、解压、`pnpm install` 期间窗口仍可拖动、最小化和交互，不出现长时间“未响应”。
- 已安装但缺少 Control UI 构建产物时，`launching` 阶段仍可响应，服务最终能正常拉起。
- onboarding 需要补跑时，服务 ready 后先进入主界面，SkillHub / GitHub 技能安装在后台继续执行且不影响主界面交互。
- 失败场景下，错误仍能通过现有 `setupError` / `service-log` / `setup-progress` 链路回到前端，并可点击重试。
- `cargo test` 通过，且 `npm run tauri dev` 手动回归“启动服务 -> 打开网关 -> 聊天正常”通过。
