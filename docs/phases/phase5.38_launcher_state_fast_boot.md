# Phase 5.38: 一次引导与常驻服务快启

> 状态：实施中，待验收

## 目标

让 DragonClaw 首次启动仍保留完整引导，但后续启动不再每次停留在 `checking / launching` 启动画面；同时把 OpenClaw 服务视为独立常驻进程，在关闭 Launcher 面板或退出 Launcher 壳时继续保活，并在下次启动时优先复用已有服务。

## 设计原则

- 保持现有 `invoke("start_service_silent")`、`invoke("stop_service")`、`invoke("is_service_running")` 契约不变。
- 引导是否完成改为显式状态文件，不再只靠 `node`、`openclaw-engine`、`node_modules`、`openclaw.json` 的存在性隐式推断。
- 非首次启动直接进入主界面，后台再做轻量检查和服务复用，异常时才回退到完整引导或错误提示。
- OpenClaw 常驻策略与工作区/模型配置解耦，不把 Launcher 状态塞进 `openclaw.json`。

## 实现方案

### 1. 独立 Launcher 状态文件

- 在 `~/.openclaw/` 下新增 Launcher 状态文件，字段固定为：
  - `setupCompleted`
  - `lastLaunchAt`
  - `lastKnownPort`
- 后端提供读取和标记完成的命令，并在配置注入成功后写入 `setupCompleted = true`。
- 服务启动或复用成功时更新 `lastLaunchAt` 与 `lastKnownPort`，为下次快启提供提示信息。

### 2. 启动流程改成双路径

- `useSetup` 保留首次安装/损坏状态的完整引导路径：
  - 环境缺失
  - 依赖缺失
  - 配置缺失
  - 状态文件明确未完成
- 对于显式已完成的用户：
  - 直接切到 `ready`
  - 同步工作区路径
  - 后台调用现有 `start_service_silent`
  - 优先复用已存在的 OpenClaw 服务
- 对于升级前的老用户，如果环境和配置齐全但状态文件缺失，则自动回填完成标记，不强迫再次走引导。

### 3. 服务保活与复用

- 延续 `openclaw-service.json` 的运行态记录与 PID/端口复用逻辑。
- `tray quit` 与窗口关闭都只关闭 DragonClaw 壳，不显式调用 `stop_service`。
- 真正停服仍只由首页/设置中的显式“停止服务”操作触发。

## 验收标准

- 首次安装只走一次完整引导，并写入 Launcher 状态文件。
- 二次启动不再显示完整引导，直接进入主界面。
- Launcher 退出后 OpenClaw 网关继续可访问。
- 重启 Launcher 时会复用已有服务，而不是重复拉起新实例。
- 运行态文件缺失但服务仍存活时，Launcher 能重新识别并继续接管。
