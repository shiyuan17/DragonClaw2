# Phase 5.74.2: 聊天噪声隐藏与时间布局修复

## 目标

继续收敛 `workspace-clone` 聊天主区域的输出显示：隐藏仍会露出的命令无输出、shell 错误回显和内部提示文件 dump，并将用户消息时间从气泡容器内部移到外部下方。

本阶段只改前端过滤、渲染、样式和测试，不改 Rust、Tauri command、Gateway 事件协议或 `invoke()` 契约。

## 当前问题

- `(no output)` 这类短形态没有被既有 `(no output recorded) Process exited...` 规则覆盖，仍会作为 assistant 消息显示。
- PowerShell 命令错误如 `rg : 无法将 “rg” 项识别为 cmdlet...` 属于执行 transcript，但当前过滤会把中文错误正文当作用户可读内容保留下来。
- `SOUL.md - Who You Are`、`AGENTS.md - ...` 等内部提示/人格/记忆文件的原始 Markdown dump 会进入主聊天区，造成用户不需要的信息曝光。
- 用户消息时间位于 `.workspace-clone__message-content` 内，因此会落在气泡背景中。

## 实施方案

- 扩展 `workspaceCloneMessageVisibility`，新增短 no-output、Process exited、PowerShell command-not-found transcript、内部提示文件 dump 的识别。
- 仅隐藏明显 raw dump / transcript：正常回答中自然语言提到 `SOUL.md` 不隐藏。
- 调整 `WorkspaceCloneChatMessageRow`：新增 `.workspace-clone__message-body` 包裹内容和时间，时间放在 `.workspace-clone__message-content` 之后。
- 更新 CSS：用户时间右对齐、assistant 时间左对齐，时间不继承气泡背景/边框。

## 验收标准

- 图 1 类 `(no output)` 消息不再显示。
- 图 2 类 `SOUL.md - Who You Are` 原始文件 dump 不再显示。
- 图 3 类 PowerShell / `rg` command-not-found transcript 不再显示。
- 图 4 用户消息时间显示在气泡外下方，气泡内部只包含 tag 和正文。
- Phase 5.74.1 的命令/技能 tag、assistant 去容器、streaming Markdown 预览和紧凑 timeline 保持不变。

## 验证命令

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run test:frontend -- workspaceCloneMessageVisibility WorkspaceCloneMessagePreview WorkspaceCloneLiveTimeline WorkspaceCloneChatView message-normalizers`
- `npm run build`
