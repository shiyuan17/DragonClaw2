# Phase 5.15.5: 聊天右侧边栏 Agent 记忆弹窗
> 状态：规划中
> 类型：前后端联动功能补齐
> 前置阶段：Phase 5.15.4 workspace 模型弹窗与厂商同步

## 目标

在 `workspace-clone` 聊天页中，把右侧会话侧栏里的“记忆”从静态占位升级为可用的 Agent 记忆弹窗。
本次实现参考 `D:/Github/DragonClaw` 的记忆资源弹窗体验，但保持 `DragonClaw2` 现有 React + Modal 结构，不迁移 Vue 组件。

弹窗需要支持按当前选中 Agent 读取、编辑、保存固定槽位的记忆 Markdown 文件，并且不影响现有聊天、网关连接、模型配置和其它 related resource 占位面板。

## 本次范围

- 为 `workspace-clone` 新增专用记忆弹窗
- 打通右侧会话侧栏、详情区按钮、composer“记忆”按钮到同一个弹窗入口
- 新增 Tauri 命令用于读取和保存 Agent 记忆文件
- 为 `main` 和非 `main` Agent 解析对应 workspace 根目录
- 用真实记忆文件摘要替换当前聊天页里的静态 `memoryItems`

## 不包含

- 不补齐 `skills / commands / tools / channel / schedule` 的真实配置能力
- 不重构整个 Agent 管理页
- 不改现有聊天 websocket、gateway 消息、会话切换逻辑
- 不新增富文本、版本历史、diff 或多人协同能力

## 关键设计

### 1. 统一入口

- 右侧会话侧栏点击“记忆”卡片直接打开弹窗
- 详情区“查看详情”打开同一个记忆弹窗
- composer 的“记忆”按钮复用同一个打开逻辑

### 2. 记忆弹窗结构

- 顶部显示：`当前 Agent 名称 · 记忆`
- 顶部保留刷新和关闭按钮
- 左栏显示搜索框与记忆文件列表
- 右栏显示当前文件标题、重点标记、编辑器与保存按钮
- 缺失文件显示“保存时自动创建”

### 3. 固定记忆槽位

固定支持以下 8 个文件：

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `MEMORY.md`
- `IDENTITY.md`
- `BOOTSTRAP.md`
- `HEARTBEAT.md`
- `TOOLS.md`

### 4. Agent 作用域与路径

- `main`：优先读 `~/.openclaw/openclaw.json` 里的默认 workspace，缺失时回退到 `~/Documents/OpenClaw-Projects`
- 非 `main` Agent：优先读配置里的 workspace，其次按约定候选目录回退
- Agent id 做小写与 `_` / `-` 兼容，避免同一 Agent 解析到不同目录

### 5. 安全边界

- `save_source_file` 本次仅支持 `kind === "memory"`
- 仅允许保存本次 snapshot 返回的白名单文件
- 禁止前端传任意路径直接写盘

## 验收标准

- 点击聊天右侧会话侧栏“记忆”可弹出记忆弹窗
- 切换不同 Agent 后，弹窗标题和内容跟随切换
- 编辑已有文件后保存，再次打开可读到新内容
- 缺失文件保存时会自动创建
- 聊天首页中的记忆摘要能反映真实文件内容
- 不影响现有聊天发送、停止、重置和模型弹窗逻辑
