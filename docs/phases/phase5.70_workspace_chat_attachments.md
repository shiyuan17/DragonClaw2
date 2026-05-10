# Phase 5.70: Workspace 聊天附件上传对齐 OpenClaw

## Summary
- 为 `workspace-clone` 聊天输入框补齐真实附件能力，并严格对齐 OpenClaw 现有的 `chat.send + attachments[]` 契约，而不是额外发明 DragonClaw 私有协议。
- 交互样式按参考图落地为两种状态：
  - 输入框内的大面积拖拽上传态
  - 选中文件后收缩为输入框上方的紧凑附件卡片态
- 本轮范围仅限当前 workspace 聊天输入区，不修改任何 Tauri command 签名，也不改现有 `invoke()` 契约。

## Context
- DragonClaw 当前 `workspace-clone` 聊天发送链路只向 Gateway 发送 `message` 字符串，尚未把 OpenClaw 已支持的 `attachments[]` 传下去。
- 本地已引入 `@tauri-apps/plugin-dialog` 与 `@tauri-apps/plugin-opener`，具备文件选择和本地打开能力。
- 已确认本机 OpenClaw 实现中：
  - Control UI / WebChat 会在 `chat.send` 时传 `attachments[]`
  - Gateway `chat.send` 已支持图片与通用文件附件
  - 历史消息中的用户附件会通过 transcript `MediaPath / MediaPaths / MediaType / MediaTypes` 等字段落盘

## Implementation Changes
- 文档先行：
  - 新增本 Phase 文档
  - 在 `docs/TODO.md` 增加未完成项
- 前端附件模型：
  - 在 `workspaceCloneTypes.ts` 新增附件相关类型，覆盖：
    - composer 已选择附件
    - message 内可展示附件
    - 发送给 Gateway 的附件 payload
  - 增加独立附件 helper 模块，负责：
    - 文件分类（图片 / 文档 / 代码 / 其他）
    - 文件读取为 data URL
    - data URL 转 OpenClaw 需要的 base64 `content`
    - 历史消息中的附件字段提取与展示数据归一化
- Composer 交互：
  - 扩展 `WorkspaceCloneComposer`
  - 支持拖拽进入、悬停、离开、放下与点击选择多文件
  - 大拖拽态仅在拖入时显示，避免常态占用过高空间
  - 已选择附件以紧凑卡片展示在 textarea 上方：
    - 图片显示缩略图
    - 文档 / 代码 / 文本显示文件卡片
  - 支持移除单个附件
  - 支持纯附件发送、文本+附件发送
- 发送链路：
  - 扩展 `useWorkspaceGatewayChat.sendMessage()` 参数，加入 `attachments`
  - `chat.send` 请求扩展为：
    - `attachments[].type = "image"` 用于图片 MIME
    - `attachments[].type = "file"` 用于非图片 MIME
    - 同时传 `mimeType`、`fileName`、`content`
  - slash command / 技能 / 会话工作目录隐藏注入继续只作用于 `message` 文本，不影响附件独立透传
- 消息渲染：
  - 扩展 `WorkspaceMessage`，支持 `attachments`
  - pending user message 立即显示附件，保证发送成功前也能看到真实预览
  - 历史消息归一化时，从 Gateway transcript 中恢复附件展示信息
  - 更新消息预览渲染：
    - 图片附件显示缩略图
    - 文件附件显示卡片
    - 仅附件无文本时也能正常显示
- 样式：
  - 仅在 `src/styles/tokens.css` 新增必要 `--dc-workspace-*` token
  - 在 `src/styles/workspace-clone.css` 增加：
    - composer 拖拽上传态
    - 附件卡片队列
    - 消息内附件预览
  - 不引入第二套视觉系统

## Interfaces / Contracts
- 不修改任何 Tauri `invoke()` 命令名、参数或返回值
- 不修改 Gateway method 名称
- 前端 `chat.send` 请求形状从：
  - `chat.send({ sessionKey, message, deliver, idempotencyKey })`
  扩展为：
  - `chat.send({ sessionKey, message, deliver, idempotencyKey, attachments })`
- 附件相关新增类型与 props 均为前端内部契约，不影响外部接口

## Test Plan
- 功能验证：
  - 拖入单张图片时，显示大面积拖拽上传区；选中后收缩为紧凑附件卡片
  - 拖拽/选择多个文件，例如 `png/jpg/pdf/docx/txt/md/ts/js/json/py`，确认都能进入附件队列
  - 删除其中一个附件时，不影响其余附件
  - 只发附件不写文字时，待发送用户消息仍能正常渲染
  - 同时发送文字和附件时，确认 `chat.send` 与 slash command / skills 组合场景不回归
  - 图片附件显示为缩略图；非图片附件显示为文件卡片
  - 既有聊天发送、停止生成、重置会话、切换历史会话、聊天文件抽屉等功能无回归
- 提交前验证：
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm run tauri dev`
  - 手动测试至少覆盖 1 个图片、1 个文档、1 个代码文件的上传发送

## Assumptions
- 这里的“聊天框”默认指 `workspace-clone` 聊天输入区，不包含其他遗留聊天入口
- 本轮实现真实的 OpenClaw 兼容附件发送，不采用“把本地路径拼进文本”的降级方案
- 剪贴板粘贴上传不在本轮范围内，本轮只做拖拽和文件选择器
- 代码文件统一按非图片附件处理，走与文档相同的 OpenClaw 文件附件链路
