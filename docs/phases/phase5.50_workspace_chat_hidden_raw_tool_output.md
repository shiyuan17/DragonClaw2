# Phase 5.50: 隐藏聊天中的原始工具/命令回显

> 状态：规划中 / 待实现
> 类型：前端聊天体验优化

## 目标

在不修改任何 Rust / Tauri command、`invoke()` 契约、OpenClaw gateway 协议或聊天发送逻辑的前提下，让 `workspace-clone` 聊天区隐藏原始工具/命令回显，并进一步处理“最终回答正文后又混入工具噪音”的情况，只保留精简 live timeline 与面向用户的最终内容。

本期覆盖两类泄漏：
- 整条 assistant 气泡本身就是原始工具/命令/抓取回显
- assistant 已经给出正常答复，但尾部又拼接了 `Command still running`、`View in browser`、原始 JSON / HTML / transcript 等无关内容

## 范围

- 仅修改 `workspace-clone` 聊天展示层与消息归一化层
- 新增一套共享的 assistant sanitizer，统一用于：
  - 历史消息归一化
  - 流式 delta 文本
  - 最终消息渲染兜底
- 保留现有 live timeline 的精简过程提示，不展示完整 stdout / stderr、原始 HTML 或调试 payload
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
- 共享 sanitizer 需要支持两种结果：
  - 纯工具噪音：整条消息隐藏
  - 正文 + 噪音混合：保留正文，裁掉尾部噪音
- `tool` 角色消息继续直接隐藏
- 正常 Markdown、链接和面向用户的 JSON 不应被误伤

## 验收标准

- 历史会话中的 `curl`、PowerShell 报错、`Command exited with code 1`、`tool: exec` JSON 等消息气泡不再显示
- 最终 assistant 回答若尾部带有 `Command still running...`、`View in browser`、原始 HTML / JSON / transcript，聊天区只保留用户真正要看的正文
- live timeline 仍显示“执行命令 / 调用工具 / 成功 / 失败”等精简状态
- 流式过程中如果当前文本仍是原始执行回显，聊天区只显示 timeline，不显示原始回显正文
- 正常 assistant Markdown / JSON 回复仍按现有方式显示
- 切换 session、切换 agent、刷新历史后，隐藏规则仍然生效
- `npm run check:encoding`、`npm run check:file-size`、`npm run tauri dev` 通过

## 手动验证

1. 发送一个会触发命令失败的请求，确认聊天区只显示 timeline 的简短失败状态，不显示原始错误块。
2. 载入包含 `tool: exec` JSON 或 PowerShell 执行回显的历史会话，确认这些消息气泡完全隐藏。
3. 发送一个会触发工具调用但最终能正常回答的请求，确认顺序为“timeline 过程提示 -> 最终正文”，不会在正文后继续挂原始工具噪音。
4. 发送一个普通请求，确认正常流式正文与最终 Markdown / JSON 预览不回归。
