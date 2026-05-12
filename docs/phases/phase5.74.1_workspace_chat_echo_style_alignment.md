# Phase 5.74.1: 聊天回显样式对齐 Codex

## 目标

在 Phase 5.74 已完成的聊天输出流程治理基础上，继续收敛 `workspace-clone` 的显示层：用户命令和技能以紧凑 tag 呈现，Agent 回复去掉外层气泡容器，流式回复在生成阶段即使用 Markdown / 富文本预览，live timeline 改为更接近 Codex 的轻量执行行。

本阶段只修改前端聊天渲染与样式，不改 Rust、Tauri command、Gateway 事件协议或 `invoke()` 契约。

## 当前链路

1. Composer 发送时，前端根据用户输入、选中 slash command、技能、知识库和工作目录构造 transport message。
2. transport message 继续包含 `[DC_WORKSPACE_*]` 隐藏上下文块，供 Gateway / Agent 使用。
3. UI 可见消息通过前端内部字段和可见文本独立渲染，用户气泡只展示用户意图，不展示隐藏注入块。
4. Gateway 流式 delta 进入前端 run 级缓冲后更新 assistant 消息。
5. tool / command / agent 事件进入 live steps，再由 timeline 渲染执行状态。
6. 历史回放通过 normalizer 和 sanitizer 再次过滤隐藏块、执行噪声和 raw payload。

## 本阶段问题

- 用户发送 `/plan ...`、`/spec ...`、`/kb-* ...` 或启用技能后，普通文本展示不够清晰，缺少“命令 / 技能已生效”的视觉信号。
- assistant 回复仍使用与用户气泡相近的外层容器，主聊天区显得厚重。
- streaming 状态曾强制 plain 文本，Markdown 列表、加粗、段落在流式阶段没有预览样式，长文本容易挤成单行。
- live timeline 虽已压缩，但仍需要进一步靠近 Codex 风格，只展示图标、类型、简短标题和状态。

## 实施方案

- 为 `WorkspaceMessage` 增加前端内部展示字段 `commandTag` / `skillTags`，只用于渲染，不写入后端契约。
- 在 `WorkspaceCloneMessagePreview` 中解析用户可见文本前缀，兼容旧历史消息没有内部字段的情况，将 `/command` 渲染为图标 + 文本 tag，技能渲染为独立 skill tag。
- 保持用户消息气泡，移除 assistant / system / live-status 正文外层边框、背景和圆角，让回复正文直接融入主聊天区。
- streaming assistant 不再强制 plain，先尝试 Markdown / JSON 预览；plain fallback 使用 `pre-wrap` 和 `overflow-wrap: anywhere`。
- 将 live timeline 渲染为紧凑 chip 行，隐藏 stdout / stderr / raw payload，只保留关键状态和短标题。

## 本次补充

- 将 live timeline 中的步骤类型标签与现有消息 tag 统一到同一套紧凑规格：12px 字号、相同内边距、圆角和行高。
- 同步收敛 live timeline 的状态 badge 尺寸，避免“执行命令 / 调用工具 / 思考中”与 `exec`、`已完成` 等标注元素视觉高度不一致。
- 本次调整仅涉及 `WorkspaceCloneLiveTimeline.tsx` 和 `src/styles/workspace-clone.css`，不改任何事件处理、流式数据结构或 `invoke()` / Gateway 契约。

## 验收标准

- 发送 `/plan 查看目前的聊天输出是否有优化的地方` 后，用户消息显示 `/plan` tag 和正文。
- 用户选中技能发送消息后，用户消息显示技能 tag，tag 使用图标 + 文本形态。
- assistant 回复不再有外层气泡容器，但头像、时间、滚动行为保持不变。
- streaming 阶段的 Markdown 列表、加粗、段落能即时按预览样式显示，plain 长文本能自动换行。
- tool / command / skill 执行状态显示为紧凑 timeline 行，不在主聊天区展示 stdout、stderr、目录列表、raw JSON 或 process 噪声。

## 验证命令

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run test:frontend -- WorkspaceCloneMessagePreview WorkspaceCloneLiveTimeline workspaceCloneMessageVisibility stream-text-buffer message-normalizers live-steps`
- `npm run build`
