# Phase 5.55.3: 启动 RPC 探测超时竞态热修

## Goal

修复 DragonClaw 在 OpenClaw 实际已经就绪后，仍因为最后一次阻塞 RPC readiness probe 卡在总启动超时边界而误判为失败的问题。

## Problem

- `wait_for_service_ready()` 会在端口已监听后周期性执行 `openclaw gateway status --require-rpc`。
- 单次 probe 当前可能阻塞约 `11s`，并且 probe 返回后没有立刻再次确认 `ready_signal`。
- 当 OpenClaw 在 probe 执行期间打印 `[gateway] ready` 时，DragonClaw 仍可能在 `SERVICE_READY_TIMEOUT_MS` 边界上落入：
  - `OpenClaw service startup timed out and RPC validation is still failing`
- 这会把一个“late ready but healthy”误判成真正失败。

## Scope

- 仅修复后端启动等待竞态。
- 不修改任何 Tauri command 名称、参数、返回值或前端 `invoke()` 契约。
- 不改变“只有 authoritative `gateway ready` 日志才可替代 RPC 成功”的策略。
- 不在本轮处理 `managed-runtime.json` 与 `~/.openclaw` 的长期状态统一问题。

## Implementation Notes

- 为 startup path 的单次 RPC probe 引入“剩余启动预算”上限，避免最后一次 probe 反向吞掉最终确认窗口。
- 在每次 RPC probe 返回后，重新确认：
  - 当前端口仍在监听
  - `ready_signal` 是否已经在 probe 期间变为 `true`
- 如果 ready 在 probe 期间到达，则直接判定启动成功，并额外写入一条 service log 说明这是 `late ready during RPC probe`。
- 在总启动超时失败分支前，再做一次最终 ready 复核，避免边界误杀。
- 继续保留现有 RPC 失败详情，确保真正失败时日志仍可定位问题。

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`
- 手动 `npm run tauri dev` 冷启动，确认不再出现“实际 ready 但 120s 误判失败”
- 手动点击重试，确认失败后的下一次启动不会停留在旧错误态
