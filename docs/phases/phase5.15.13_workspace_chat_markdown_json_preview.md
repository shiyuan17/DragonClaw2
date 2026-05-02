# Phase 5.15.13: workspace-clone 聊天 Markdown / JSON 预览
> 状态：开发中
> 类型：前端渲染增强 / 聊天阅读体验优化

## 目标

在不改动任何网关协议、Tauri `invoke()` 调用、后端命令签名或聊天发送逻辑的前提下，为 `workspace-clone` 首页聊天气泡补齐助手消息的 Markdown / JSON inline 预览能力。

本期只增强消息展示层：
- 仅助手消息启用自动预览
- 流式生成期间保持纯文本，生成完成后再切换为预览
- 优先识别合法 JSON，其次识别 Markdown，其余内容回退纯文本

## 本次范围

- 为 `workspace-clone` 聊天区新增一个独立的消息内容预览子组件，避免继续堆积在 `WorkspaceCloneChatView`
- 复用现有 `react-markdown` + `remark-gfm` 渲染 Markdown
- 对合法 JSON 做安全解析与格式化展示，不引入新的依赖
- 为聊天气泡内的列表、表格、代码块、链接、引用和 JSON 代码块补齐样式
- 保持现有作者、时间、pending / streaming / error 状态视觉不变

## 不包含

- 不新增或修改 `WorkspaceMessage` 字段
- 不改 `useWorkspaceGatewayChat` 的发送、历史同步、流式拼接、停止生成逻辑
- 不改任何 Rust / Tauri 命令、网关协议、事件结构或 `invoke()` 契约
- 不给 user / tool / system 消息启用富文本预览
- 不引入代码高亮、复制按钮或消息级视图切换交互

## 验收标准

- 助手消息中的 Markdown 标题、列表、链接、代码块、表格可在气泡内正确渲染
- 助手消息中的合法 JSON 可按缩进格式化并以代码块样式展示
- 非法 JSON 不报错，回退为纯文本显示
- 助手流式消息在生成过程中保持纯文本，生成完成后再进入 Markdown / JSON 预览
- user / tool / system 消息继续保持原有纯文本展示
- `workspace-clone` 现有聊天发送、停止生成、历史回放与消息时间显示不回归
