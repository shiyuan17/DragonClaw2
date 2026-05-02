# Phase 5.23: OpenClaw PATH 暴露、退出保活与启动引导防卡死
> 状态：Planned
> 日期：2026-05-02

## 背景

当前 5.23 已经开始处理两个底层问题：
- 安装后无法直接在终端执行 `openclaw`
- 从托盘退出 DragonClaw 时会一并关闭 OpenClaw，导致下次启动无法复用现有服务

但验收过程中又暴露出两个启动体验问题：
- checking / initializing 阶段主标题仍带 `DragonClaw`，且 `正在检查环境` 容易换成两行
- `useSetup` 的启动链路存在多段串行等待，CLI 回填、诊断和推荐技能安装都可能拖住 phase，看起来像引导卡死

这次将已有 5.23 后端改动继续收口，并同步修正启动引导文案、排版和非阻塞启动逻辑，保证“安装即能用 CLI、退出不关服务、下次启动可复用、启动页不假死”一起闭环。

## 目标

- 安装完成后，将 `openclaw` 暴露到当前用户 PATH，新开终端可直接执行
- 托盘 `退出` 仅退出 DragonClaw，不关闭后台 OpenClaw；下次启动优先复用现有服务和端口
- checking / initializing 主标题去掉 `DragonClaw`，`正在检查环境` / `正在初始化` 保持单行显示
- 启动流改成“关键路径限时、辅助任务后台化、超时可降级”，避免引导长期卡在 checking / launching
- 保持现有 Tauri command 签名和前端 `invoke()` 参数结构不变

## 实施方案

### 1. CLI PATH 暴露

- 保留 `ensure_openclaw_cli_available` command，继续作为唯一的 PATH 回填入口
- Windows 目标目录固定 `%USERPROFILE%\\.local\\bin`，生成 `openclaw.cmd`
- shim 通过内置 Node 调 `openclaw-engine/openclaw.mjs`，并透传 `%*`
- `setup_openclaw()` 末尾继续调用该 command
- 已安装用户在 `useSetup.checkEnvironment()` 中继续做无感回填
- PATH 写入保持幂等，只做当前用户级 PATH，不要求管理员权限

### 2. 退出保活与服务复用

- 保留 `~/.openclaw/openclaw-service.json` 运行态文件，记录 `pid`、`port`、`startedAt`
- 托盘 `quit` 分支不再主动 `kill()` OpenClaw
- `is_service_running` 优先检查内存中的 child，再检查运行态文件对应的 pid / port 是否仍有效
- `start_service` / `start_service_silent` 启动前先尝试接管已有服务；若可复用则直接发 `service-port` 并返回 `already running`
- 若运行态文件 stale，则清理后再正常启动
- `stop_service` 兼容停止当前 app 进程内 child 和复用回来的外部服务

### 3. 启动引导 UI 收口

- `SetupWizard` 在 `checking` / `initializing` 阶段的主标题改为纯状态文案：
  - `正在检查环境`
  - `正在初始化`
- 保留小号 `DRAGONCLAW` eyebrow，不在主标题重复品牌名
- 描述区只显示次级说明；当 `progressMsg` 与标题同义或只是追加省略号时，回退到稳定说明文案，避免同屏重复
- `setup.css` 去掉 `.startup-title` 的字符宽度限制，改为单行优先显示；移动端通过字号收敛而不是强制折行

### 4. 启动流防卡死

- 在 `useSetup.ts` 新增统一的 `withTimeout()` / `invokeWithTimeout()` 辅助
- 给以下调用增加超时保护：`check_node_exists`、`check_openclaw_exists`、`check_node_modules_exists`、`is_service_running`、`check_config_exists`、`get_current_config`、`ensure_openclaw_cli_available`、`getOnboardingSkillInstallDiagnostics`
- `checkEnvironment()` 改成两段式：
  - 基础环境探测并行跑 `Promise.allSettled`
  - 只把“是否需要安装 / 是否需要配置工作区 / 是否可以直接启动服务”留在关键路径
- CLI 回填与 onboarding backfill 诊断改为 best-effort 后台任务，只记日志，不阻塞 phase
- `launchService()` 在 `start_service_silent` 返回后立刻主动轮询 `is_service_running`，每 750ms 检查一次，最长 15s，不再只依赖日志 ready 信号
- `finalizeStartup()` 改为“服务 ready 优先”：服务可用后立即进入 `ready` 并执行 `checkApiKey()`；推荐技能安装改为 ready 后后台执行，只写日志与进度文案

## 约束

- 不改任何现有 command 的签名、名字和参数结构
- 不改 UI 功能流，不新增新的引导交互
- 保持“点窗口关闭隐藏到托盘”逻辑不变
- 基于当前工作区已有 5.23 改动继续收口，不回退 `service.rs`、`openclaw_cli.rs`、`useSetup.ts` 等正在进行中的实现

## 验收

- fresh install 完成后，新开 PowerShell / CMD 能解析 `openclaw`
- 已安装用户再次启动 DragonClaw 时，也会自动补齐 shim 和 PATH
- checking / initializing 主标题不再显示 `DragonClaw`，`正在检查环境` 单行显示，描述区不重复标题
- 冷启动时即使 CLI 回填、诊断或推荐技能安装较慢，也不会卡在 checking / launching；主界面应先进入 ready，辅助任务只写日志
- 启动服务后通过托盘 `退出` 关闭 DragonClaw，网关仍可继续访问
- 重新打开 DragonClaw 时，不再启动第二份服务，而是直接复用原端口进入 ready
- 在复用后的会话中点击“停止服务”，仍能真正停掉后台那份 OpenClaw
- 人工杀掉后台 OpenClaw 后再次打开 DragonClaw，会清理 stale 状态并正常重启服务
- `npm run tauri dev` 能正常启动，并可手动走通“启动服务 -> 打开网关 -> 托盘退出应用 -> 网关继续可用 -> 重新打开应用 -> 停止服务”完整链路
