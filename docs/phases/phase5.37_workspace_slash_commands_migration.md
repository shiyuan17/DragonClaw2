# Phase 5.37: Workspace Slash Commands 迁移

## Goal

将参考项目中的 Slash Command 能力迁移到 `DragonClaw2` 的 `workspace-clone` 聊天工作台，首版按全局共享模型实现，并完整覆盖命令管理、输入联想、激活态展示和发送生效链路。

## Scope

- 在 `workspace-clone` 中新增全局共享的 Slash Command 管理能力。
- 保留两类命令来源：
  - `builtin`：系统默认命令
  - `custom`：用户自定义命令
- 本阶段仅完整落地 `custom` 的持久化、管理与使用流程。
- `builtin` 仅保留类型、分组与只读展示扩展位，不内置任何实际命令。
- 发送时通过前端包装消息内容让命令生效，不修改当前 gateway 协议。

## Non-goals

- 不做按 Agent 隔离的命令集。
- 不做按会话隔离的临时命令集。
- 不引入知识库工作流的内置命令迁移。
- 不修改现有 `chat.send`、`invoke()` 或 gateway 的结构化消息协议。

## Backend Changes

### Storage

- 新增 `src-tauri/src/slash_commands.rs` 独立模块，职责仅限全局 Slash Command 的读写与规范化。
- 在 `src-tauri/src/paths.rs` 新增 `slash_commands_path()`，统一将文件落到 `~/.openclaw/slash-commands.json`。
- JSON 记录结构：
  - `id: string`
  - `command: string`
  - `name: string`
  - `description: string`
  - `instruction: string`

### Tauri Commands

- `load_custom_slash_commands() -> Result<Vec<SlashCommandRecord>, String>`
- `save_custom_slash_commands(commands: Vec<SlashCommandRecord>) -> Result<Vec<SlashCommandRecord>, String>`

### Normalization Rules

- `id`、`name`、`instruction` 为空时丢弃该记录。
- `command` 为空时回退使用 `name` 生成命令值。
- `command` 统一规范化为 `/kebab-case`。
- 以规范化后的命令值去重，保留首个有效项。
- 仅保存 `custom` 记录；`builtin` 不写入文件。

## Frontend Changes

### Types and State

- 在 `workspaceCloneTypes.ts` 增加：
  - `WorkspaceSlashCommandSource`
  - `WorkspaceSlashCommandDefinition`
  - `WorkspaceActiveSlashCommand`
  - `WorkspaceSlashCommandDraftInput`
- 前端保留 `builtin` 常量数组，当前为空。
- `WorkspaceClonePage.tsx` 增加：
  - 命令列表加载/保存状态
  - 当前激活命令
  - 命令面板开关
  - 编辑草稿
  - 搜索词
  - 错误与提示文案

### Command Modal

- 用真实 `WorkspaceCloneCommandsModal.tsx` 替换当前 `commands` 占位面板。
- 面板分成两组：
  - 系统默认命令：当前为空，展示空状态
  - 用户自定义命令：支持创建、编辑、删除、点击激活
- `builtin` 仅展示只读语义，不提供编辑与删除入口。

### Composer Experience

- `WorkspaceCloneComposer.tsx` 增加激活命令 chip。
- 当输入内容以 `/` 开头时，展示命令联想层并支持键盘选择。
- 选择命令后：
  - 移除输入框中的 slash token
  - 保留用户正文
  - 设置当前激活命令
- 当输入框为空且用户按 `Backspace` / `Delete` 时，可清除当前激活命令。

## Send Flow

- `useWorkspaceGatewayChat.ts` 为发送逻辑增加命令包装能力。
- UI 展示的用户消息始终保留原始输入，不显示命令包装文本。
- 实际发送到 gateway 的消息采用固定可升级标记包装：
  - 命令标记头
  - `command`
  - `name`
  - `source`
  - `instruction`
  - `user message`

## Acceptance Criteria

- 聊天页可以打开命令面板并创建自定义命令。
- 自定义命令重启应用后仍能读取。
- 输入 `/` 时可联想命令并完成激活。
- 激活命令后发送消息，聊天 UI 只显示用户原始文本，但模型实际收到包装后的命令说明。
- 现有历史会话、技能、工具、模型、频道能力不被破坏。
- 新增 Tauri 命令可正常注册与调用，既有命令签名不变。

## Validation

- Rust 单元测试覆盖：
  - 缺失文件返回空列表
  - 非法 JSON 返回可读错误
  - 命令规范化为 `/kebab-case`
  - 重复命令去重
  - 缺失必填字段时过滤
- 前端验证至少覆盖：
  - `/` 联想
  - 激活 chip 展示与清除
  - 自定义命令增删改
  - 发送包装与 UI 文本分离
