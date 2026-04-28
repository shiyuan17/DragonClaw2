# Phase 5.15: 首页聊天接入内置 OpenClaw

> 状态：规划中
> 类型：前端功能接入
> 前置阶段：Phase 5.10 默认首页壳层克隆、Phase 5.12 聊天工作区 UI 克隆、Phase 5.13 聊天工作区视觉收敛

## 目标

在保留 `workspace-clone` 首页外壳的前提下，把首页 `聊天` 菜单从静态占位升级为真实可用的 OpenClaw 聊天入口。

本期不嵌 iframe，不重写 Rust 网关接口，而是由前端直接连接内置 OpenClaw 网关 WebSocket 协议，让首页壳层真正驱动 Agent 会话、消息历史、流式回复和停止生成。

## 接入方式

### 选型

- 使用前端 WebSocket 直连 `ws://localhost:<servicePort>`
- 使用现有本地 token 完成网关 `connect` 握手
- 直接调用 OpenClaw 已存在的网关方法：
  - `agents.list`
  - `sessions.list`
  - `chat.history`
  - `chat.send`
  - `chat.abort`
- 订阅 `chat` 事件，处理 `delta / final / aborted / error`

### 不采用

- 不嵌 OpenClaw 原生控制台页面
- 不新增、不删除、不改名任何 Tauri `invoke()` 命令
- 不新增 Rust 聊天代理层
- 不把频道、团队在本期映射为真实聊天会话

## 协议来源

本期实现以本地 OpenClaw 源码中的现有协议为准，主要参考：

- `C:/Users/cobalt-47/AppData/Local/OpenClawLauncher/openclaw-engine/ui/src/ui/gateway.ts`
- `C:/Users/cobalt-47/AppData/Local/OpenClawLauncher/openclaw-engine/ui/src/ui/controllers/agents.ts`
- `C:/Users/cobalt-47/AppData/Local/OpenClawLauncher/openclaw-engine/ui/src/ui/controllers/chat.ts`
- `C:/Users/cobalt-47/AppData/Local/OpenClawLauncher/openclaw-engine/src/gateway/server-methods/agents.ts`
- `C:/Users/cobalt-47/AppData/Local/OpenClawLauncher/openclaw-engine/src/gateway/server-methods/chat.ts`
- `C:/Users/cobalt-47/AppData/Local/OpenClawLauncher/openclaw-engine/src/gateway/server-methods/sessions.ts`

## 本次范围

### 包含

- 在 `workspace-clone` 链路新增最小可用网关客户端层
- 首页连接状态、错误状态、历史消息、流式回复状态管理
- `数字员工` 目录切换为真实 Agent 列表
- 选中 Agent 时切换到对应主会话 `agent:<agentId>:main`
- 输入区接入真实发送、停止生成、新对话
- 服务启动和配置变更后的重启切换为静默启动

### 不包含

- 附件、语音、知识库、Slash Command 的真实联动
- 频道真实绑定与频道会话映射
- 团队真实会话映射
- 新的 Rust/Tauri 接口
- legacy tabs 删除或重构

## 页面行为约束

### 首页主入口

- 首次进入 ready 后，首页聊天应作为默认主入口
- 启动服务时不再自动弹浏览器
- 切换模型或保存 Provider 配置后，服务重启改为静默模式
- 仍保留“在浏览器打开控制台”的显式入口作为兜底

### 目录区

- 保留 `数字员工 / 频道 / 团队` 三个标签文案
- 本期只把 `数字员工` 接入真实 Agent 数据
- `频道` 和 `团队` 继续保留占位，不误导为真实聊天能力

### 聊天区

- 欢迎态在无历史消息时展示
- 有历史时展示真实会话消息
- 发送消息后立即显示本地用户消息
- 助手回复支持流式中间态和最终态
- 服务未启动、连接失败、网关报错时展示明确空态或错误提示

## 类型与状态

前端内部可以新增类型，但只用于页面内消费，不改变现有前后端契约。至少包括：

- 网关连接状态
- Agent 列表与主会话键
- 会话历史与消息显示模型
- 流式生成中状态
- 聊天错误与重连状态

## 验收标准

- `docs/phases/phase5.15_homepage_chat_integration.md` 与 `docs/TODO.md` 先落地
- 文档 commit 与代码 commit 分离
- `npm run tauri dev` 可正常启动
- 首页 ready 后不自动弹出系统浏览器
- 首页 `数字员工` 列表显示真实 Agent
- 切换 Agent 时切到对应主会话并刷新历史
- 发送消息后可看到用户消息、本地发送态、流式回复和最终回复
- 点击停止可中断当前生成
- 切换模型或保存 Provider 配置后，服务静默重启且首页聊天可恢复连接
- “在浏览器打开控制台” 仍可正常打开 OpenClaw 原生页面
- legacy tabs、配置保存、模型切换、日志监听能力不回归

## 遗留说明

以下内容本次继续保留为后续阶段：

- 频道真实绑定与频道会话映射
- 团队真实会话映射
- 附件、语音、知识库、Slash Command 的真实功能接入
- 更多首页聊天能力与 OpenClaw 原生控制台的功能补齐
