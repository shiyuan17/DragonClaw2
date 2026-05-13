# Phase 5.69.3: Workspace Agent Shared Workdir Default

## Summary

- 将 `workspace-clone` 的项目目录选择从“按会话内存态”调整为“按 Agent 共享默认值”。
- 同一 Agent 下任一聊天选择或清空项目目录后，立即更新该 Agent 的默认项目目录；点击 `新对话` 时继续沿用该默认值。
- 切回同一 Agent 的旧会话时，显示该 Agent 当前最新默认项目目录，而不是历史会话快照。
- 使用前端本地存储跨重启持久化，不改任何 Tauri command、Gateway 协议或 `invoke()` 契约。

## Implementation Changes

- 文档落地：
  - 在 `docs/TODO.md` 记录本次行为变更，挂到现有 Phase 5.69 相关任务下。
  - 新增本 Phase 文档，明确从“会话级工作目录”迁移到“Agent 级共享默认值”的范围与约束。
- 前端状态：
  - 新增 `workspace-clone` 本地存储 helper，维护 `agentId -> workspacePath` 的 map。
  - 规范化 Agent ID 与目录路径，忽略坏数据，存储失败时静默降级，避免影响聊天主链路。
- Workspace 行为：
  - `WorkspaceClonePage` 不再以 `sessionKey` 作为项目目录状态主键。
  - 当前聊天使用的项目目录改为根据当前聊天归属 Agent 解析：
    - Agent 聊天使用当前 Agent ID。
    - 频道聊天使用频道绑定的 `runtimeAgentId`。
  - 欢迎态、composer、发送消息上下文注入统一读取该 Agent 的共享默认目录。
  - `新对话` 不再为新 session 显式清空工作目录；同一 Agent 下自然继承默认值。

## Interfaces / Contracts

- 保持现有隐藏上下文注入协议不变：已选择目录时继续注入 `cwd` transport block，未选择时不注入。
- 不新增、不删除、不修改任何 Tauri command、Gateway 事件或 `invoke()` 参数 / 返回结构。
- 不把项目目录写入后端 SQLite 聊天缓存，也不修改现有 session cache schema。

## Test Plan

- 为新的 Agent workdir state helper 补纯逻辑单测，覆盖：
  - 正常读取已持久化的 Agent 默认目录。
  - 坏 JSON、异常 shape、空键值的容错。
  - Agent ID / 路径规范化。
  - 清空目录时删除对应 Agent 项。
- 为共享默认值行为补纯逻辑单测，覆盖：
  - Agent A 选择目录后可以从持久化状态恢复。
  - 同一 Agent 的新会话继续读取该目录。
  - Agent B 不继承 Agent A 的目录。
  - 清空 Agent A 后后续会话为空。
  - 同一 Agent 的旧会话读取最新默认值。
- 提交前执行：
  - `npm.cmd run check:encoding`
  - `npm.cmd run check:file-size`
  - 相关 `vitest` 定向测试

## Assumptions

- “切换新的会话”指产品内 `新对话` / `createNewSession` 流程，不包含跨 Agent 切换。
- 该需求要的是“同一 Agent 共享默认项目目录”，不是“每个历史会话保留自己的目录快照”。
- 允许使用前端 `localStorage` 做跨重启持久化；暂不要求跨窗口实时同步。
