# Phase 5.23: OpenClaw CLI PATH 暴露与退出保活

> 状态：规划完成，待实现

## 目标

让 DragonClaw 在引导安装完成后自动暴露 `openclaw` 终端命令，并让托盘“退出”只关闭 DragonClaw 本体，不主动关闭后台 OpenClaw 服务；下次重新打开 DragonClaw 时，需要能够识别并复用这份仍在运行的服务，而不是重复拉起新实例。

## 设计原则

- 保持现有 `invoke("start_service_silent")`、`invoke("stop_service")`、`invoke("is_service_running")` 契约不变。
- PATH 注册范围固定为当前用户，不要求管理员权限。
- CLI PATH 暴露只覆盖 Windows，使用 `~/.local/bin/openclaw.cmd` 作为入口。
- 关闭窗口隐藏到托盘的行为保持不变，本次只调整托盘“退出”。
- 不新增引导弹窗或额外确认步骤，只允许补日志和安装进度文案。

## 实现方案

### 1. CLI PATH 暴露

1. 在 `src-tauri/src/openclaw_cli.rs` 增加 CLI 暴露 helper：
   - 解析内置 Node 路径和 `openclaw-engine/openclaw.mjs`
   - 生成 `openclaw.cmd`
   - 幂等合并当前用户 PATH
2. 新增 Tauri command：`ensure_openclaw_cli_available`
   - 返回 `shimPath`、`pathUpdated`、`restartRecommended`
   - 已存在时不重复追加 PATH
3. 在 `setup_openclaw()` 完成安装后调用该 command 对应的内部实现。
4. 在 `useSetup.checkEnvironment()` 的“老用户环境完整”路径下再调用一次，做无感回填。

### 2. 服务退出保活与复用

1. 在 `src-tauri/src/service.rs` 新增运行态文件：
   - 路径：`~/.openclaw/openclaw-service.json`
   - 字段：`pid`、`port`、`startedAt`
2. 启动服务成功后写入运行态文件，并同步更新内存态。
3. `is_service_running` 改为：
   - 先检查当前进程持有的 `Child`
   - 再检查运行态文件记录的 `pid/port`
   - stale 运行态会自动清理
4. `start_service_silent` / `start_service` 改为先尝试复用已有服务：
   - 若运行态有效，则直接回填端口并返回 `already running`
   - 若运行态失效，则清理后正常启动新实例
5. `stop_service` 同时支持停止：
   - 当前进程内的 `Child`
   - 上一次退出后保留下来的外部 OpenClaw 进程
6. `lib.rs` 的托盘 `quit` 分支不再主动 `kill()` OpenClaw 服务。

## 变更边界

- 允许改动：
  - `src-tauri/src/openclaw_cli.rs`
  - `src-tauri/src/service.rs`
  - `src-tauri/src/setup.rs`
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/paths.rs`
  - `src/hooks/useSetup.ts`
- 不改：
  - OpenClaw 后端命令签名
  - 现有引导交互流程
  - Rust 后端与前端之间已有 `invoke()` 参数结构

## 验收标准

- fresh install 完成后，新开的 PowerShell / CMD 可以执行 `openclaw`
- 旧安装用户再次打开 DragonClaw 后也会自动补齐 `openclaw.cmd` 和当前用户 PATH
- 通过托盘“退出”关闭 DragonClaw 后，OpenClaw 网关仍保持可访问
- 重新打开 DragonClaw 时不重复拉起新服务，而是复用原有端口进入 ready
- 复用后的服务仍可被“停止服务”按钮正确关闭
- stale 运行态文件会在下次启动时被自动清理，不阻塞重启

## 验证

- Rust 单测覆盖：
  - shim 内容生成
  - PATH 合并幂等
  - 运行态文件读写
  - stale 运行态识别与清理
- 提交前验证：
  - `npm run tauri dev`
  - 手动走“启动服务 -> 打开网关 -> 托盘退出应用 -> 网关继续可用 -> 重新打开应用 -> 停止服务”链路
