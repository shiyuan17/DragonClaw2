# Phase 5.24.1: workspace-clone 工具完成后的思考桥接态

> 状态：规划中 / 待实现
> 类型：前端聊天体验优化

## 目标

在不修改任何后端协议、Tauri `invoke()` 契约、聊天历史结构或消息发送逻辑的前提下，为 `workspace-clone` 首页聊天补上一段前端本地的 `思考中` 桥接态。

这段桥接态用于覆盖这样一段空窗：

- 工具 / 命令步骤已经显示“已完成”
- 最终助理文本回复还没有开始流式输出
- 用户此时会误以为界面卡住或没有后续反馈

本期目标是让当前 live timeline 在这段空窗里继续给出明确反馈，形成：

`思考中 -> 工具/命令步骤 -> 思考中 -> 最终回复`

## 范围

- 仅修改前端 `workspace-clone` 聊天展示与运行态归并逻辑
- 复用现有 `liveSteps` 时间线，不新增独立消息气泡
- 桥接态仅存在于当前运行中的消息流程内，不写入历史消息
- 保持现有 tool / command / thinking step 的视觉结构与脉冲样式
- 统一时间线中 thinking 文案为 `思考中`

## 不包含

- 不修改 Rust / Tauri 命令
- 不修改任何 `invoke()` 调用、参数或返回值
- 不修改 OpenClaw gateway WebSocket 事件协议
- 不修改 `WorkspaceMessage`、历史消息持久化或聊天记录加载逻辑
- 不新增第二套“处理中”面板、独立系统消息或额外浮层

## 实现约束

- 继续保留现有 run 启动时的默认 `thinking` step
- 新增一个前端本地的 transient thinking step，使用当前 run id 命名空间，例如 `${runId}:post-tool-thinking`
- 仅在以下条件同时满足时插入桥接 thinking step：
  - 当前 run 仍然活跃
  - 当前 run 已经出现过至少一个非 thinking 的 live step
  - 最新的非 thinking step 刚刚进入终态：`success` / `error` / `aborted`
  - 当前 run 尚未收到带非空文本的 assistant `chat.delta`
- 一旦 assistant 文本开始流式输出，立即移除该桥接态
- 如桥接态后又出现新的工具/命令/其他非 thinking step，桥接态应自然让位给新的 live step
- 在 `final`、`error`、`aborted`、切换 session / agent、reset、断连、发送失败时，桥接态必须和当前 run 的其他运行态一起清空

## 验收标准

- 工具或命令完成后，如果最终回复尚未开始流式输出，时间线中会出现 `思考中`
- 一旦最终文本开始流式输出，桥接 `思考中` 会立即消失，不会与正文并存太久
- 没有工具调用的普通回答流程，不会额外插入重复的 `思考中`
- 中止、报错、切换 Agent、切换会话、重置会话后，不会残留旧的桥接态
- `npm run build` 通过

## 手动验证

1. 发送一个会触发工具调用的请求，确认顺序为：`思考中 -> 工具/命令步骤 -> 思考中 -> 最终回复`
2. 发送一个工具完成后几乎立刻开始出字的请求，确认桥接 `思考中` 会在首个非空 `chat.delta` 到达时消失
3. 发送一个不触发工具调用的普通请求，确认只保留现有初始 thinking 行为，不出现额外重复桥接
4. 在运行中执行停止生成，确认没有残留 `思考中`
5. 在运行中切换 Agent 或切换会话，确认旧 run 的 timeline 与桥接态被清空
