# Phase 5.50: 隐藏聊天中的原始工具/命令回显

> 状态：规划中 / 待实现
> 类型：前端聊天体验优化

## 目标

在不修改任何 Rust / Tauri command、`invoke()` 契约、OpenClaw gateway 协议或聊天发送逻辑的前提下，让 `workspace-clone` 聊天区隐藏原始工具/命令回显，只保留精简 live timeline 与最终面向用户的正文回答。

本期主要覆盖三类原始过程内容：

- 结构化流程载荷：工具结果 JSON、搜索 / 抓取 / exec 等过程 payload
- 命令执行回显：命令本身、PowerShell / 终端报错、退出码、stdout / stderr 摘要
- 组合型 Markdown 执行记录：命令 bullet、错误代码块、`(Command exited with code N)` 这类整段执行回显

## 范围

- 仅修改 `workspace-clone` 聊天展示层与消息归一化层
- 为“是否属于原始流程回显”新增一套共享判定逻辑，并让历史消息、流式消息和渲染兜底共同复用
- 保留现有 live timeline 的精简过程提示，不展示完整 stdout / stderr 或原始错误块
- 保留正常 assistant 正文、Markdown 预览和面向用户的合法 JSON 预览

## 不包含

- 不修改任何 Rust 后端文件
- 不修改任何 Tauri command 名称、参数或返回值
- 不修改 OpenClaw gateway WebSocket 事件协议
- 不修改 `chat.send`、`chat.abort`、历史同步或 live timeline 事件写入逻辑
- 不把相同规则扩散到日志页、诊断页等显式调试区域

## 实现约束

- 原始回显过滤必须同时覆盖：
  - 历史消息归一化阶段，避免切换 session 或 final 回放时再次出现
  - 流式 assistant 文本阶段，避免执行回显以正文气泡形式插入聊天区
  - 最终渲染阶段，作为同源兜底，防止漏网消息进入 UI
- 共享判定逻辑优先识别“纯执行记录”，避免误伤正常说明性 Markdown、最终答复或用户可直接消费的 JSON
- `tool` 角色消息继续直接隐藏
- 若 assistant 文本后续混入真正正文，应优先保留正文，不让聊天区长期只显示过程回显

## 验收标准

- 历史会话中包含 `curl`、PowerShell 报错、`Command exited with code 1`、`tool: exec` JSON 的消息气泡不再显示
- live timeline 仍会显示“执行命令 / 调用工具 / 失败”等精简状态
- 流式过程中如果当前文本仍是原始执行回显，聊天区只显示 timeline，不显示原始回显正文
- 正常 assistant Markdown / JSON 答复仍按现有方式显示
- 切换 session、切换 agent、刷新历史后，隐藏规则仍然生效
- `npm run check:encoding`、`npm run check:file-size`、`npm run tauri dev` 通过

## 手动验证

1. 发送一个会触发命令失败的请求，确认聊天区只显示 timeline 的简短失败状态，不显示原始错误块。
2. 载入包含 `tool: exec` JSON 或 PowerShell 执行回显的历史会话，确认这些消息气泡完全隐藏。
3. 发送一个会触发工具调用但最终能正常回答的请求，确认顺序为“timeline 过程提示 -> 最终正文”。
4. 发送一个不触发工具的普通请求，确认普通流式正文与最终 Markdown / JSON 预览不回归。
