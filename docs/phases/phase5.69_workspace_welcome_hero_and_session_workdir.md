# Phase 5.69: Workspace 欢迎态与会话级工作目录选择

## 背景

`workspace-clone` 首页聊天区在空白新会话时仍然沿用旧的最小消息气泡欢迎态，既没有参考图中的品牌中心 hero，也缺少“选择工作目录”的前置操作入口。与此同时，composer 也没有可复用的会话级工作目录选择能力，导致“让当前聊天默认围绕某个本地目录展开”无法在现有前端链路中表达。

本阶段限定在前端渲染层和既有聊天发送链路内完成：

- 新建聊天空态改为参考图风格 hero。
- 欢迎态与 composer 共用一套“选择工作目录”入口与菜单。
- 工作目录仅保存在前端会话级状态中。
- 发送消息时通过隐藏上下文把当前工作目录传给 Agent。
- 不修改任何 Tauri command、`invoke()` 签名、gateway 协议或 `sessions.create` / `chat.send` 接口形状。

## 目标

1. 新建聊天或切入空白会话时，主聊天区显示中心 logo、文案 `DragonClaw,让Ai更简单` 和工作目录入口。
2. 聊天输入框底部新增同一套工作目录入口，和欢迎态共享完全一致的菜单、选目录、清空目录逻辑。
3. 工作目录按 `sessionKey` 维护，不跨会话继承，也不做跨重启持久化。
4. 普通消息和 slash-command 消息在发送时都能携带该目录的隐藏上下文；UI 仍只显示用户原始输入。

## 实现方案

### 1. 会话级工作目录状态

- 在 `WorkspaceClonePage` 新增 `sessionWorkspaceDirs` 内存 map，键为当前聊天 `sessionKey`，值为该会话选择的绝对目录路径。
- 使用 `homepageChat.currentSessionKey` 作为当前读写键。
- 新建聊天成功后，为新 session 显式初始化为空目录，保证不会继承上一会话。
- 切换历史会话时直接通过当前 `sessionKey` 读取此前目录；无值时视为未选择目录。

### 2. 统一目录选择入口

- 新增共享的前端目录选择组件，供欢迎态和 composer 复用。
- 入口点击后打开同一菜单，包含两项：
  - `选择新项目`：调用 `@tauri-apps/plugin-dialog` 的目录选择器。
  - `不需要项目`：清空当前 session 的目录。
- 取消系统目录选择器时保持原值不变。
- 已选目录时，入口主文案显示目录名，完整路径通过 `title` 和次级说明暴露，避免长路径撑坏布局。

### 3. 欢迎态更新

- 在 `WorkspaceCloneChatView` 的“已连接但无消息”状态中，用新的中心 hero 替换原最小消息气泡欢迎态。
- 引入 `src/assets/dragonclaw-logo.png` 作为中心 logo。
- hero 下方直接放工作目录入口，视觉参考图 1，使用现有 `--dc-workspace-*` token；如缺少语义 token，只在 `src/styles/tokens.css` 增补一次。
- 原有首页建议卡片不再作为该空态主视觉核心，避免与参考图冲突。

### 4. Composer 入口接入

- 在 `WorkspaceCloneComposer` 底部 pills 区增加工作目录入口。
- 入口与欢迎态使用同一个共享组件和同一组 handlers。
- 已选目录时显示已绑定状态；清空后恢复默认“选择工作目录”提示。

### 5. 隐藏上下文注入

- 扩展现有 `buildWorkspaceComposerTransportMessage`，支持接收可选工作目录。
- 若当前会话已选择目录，则在实际 `transportText` 中追加一段隐藏上下文，明确：
  - 当前工作目录的绝对路径。
  - 默认将该目录视为本次会话中文件与命令操作的工作起点。
- 若未选择目录，则保持现有消息 transport 行为不变。
- 该隐藏上下文仅用于普通聊天 / slash-command 消息；手动任务运行的新聊天不复用该目录状态。

## 验证

- 点击“新对话”进入空白会话后，聊天区显示 logo、`DragonClaw,让Ai更简单` 和未选择目录入口。
- 在欢迎态选择目录后，composer 中同步显示同一目录；在 composer 清空后欢迎态同步恢复默认提示。
- 取消系统目录选择器时，原目录保持不变。
- A 会话选择目录、B 会话不选择；来回切换时两者状态各自保持。
- 发送消息时：
  - UI 仍只显示用户原始输入。
  - 已选目录会注入隐藏工作目录上下文。
  - 未选目录不注入任何目录提示。
- `sessions.create` 新建聊天、历史切换、流式回复、终止回复、模型/邮箱/命令入口不回归。

## 约束

- 不改任何 Tauri command、`invoke()`、gateway 协议、`sessions.create` 或 `chat.send` 契约。
- 工作目录默认为会话级、内存态，不做持久化。
- 文案固定使用 `DragonClaw,让Ai更简单`。
