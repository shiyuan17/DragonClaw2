# Phase 5.15.6: 聊天右侧边栏技能库与工具权限弹窗
> 状态：规划中
> 类型：前后端联动功能补齐
> 前置阶段：Phase 5.15.5 workspace 记忆弹窗

## 目标

在 `workspace-clone` 聊天页中，把右侧会话边栏里的“技能库”“工具权限”从静态占位升级为可用弹窗，并且支持按当前选中的 Agent 读取、编辑、保存真实配置。

本次实现参考 `D:/Github/DragonClaw` 的技能/工具资源面板交互，但保留 `DragonClaw2` 现有 React + Modal 架构，不迁移 Vue 组件。配置将真实写入 `~/.openclaw/openclaw.json` 的 `agents.list[].skills` 和 `agents.list[].tools`。

技能配置保存后，不重建主会话、不清空聊天历史，而是清掉当前 Agent 主会话的 `skillsSnapshot`，让下一条消息按新技能配置重新构建技能快照。

## 本次范围

- 为 `workspace-clone` 新增独立的技能库弹窗
- 为 `workspace-clone` 新增独立的工具权限弹窗
- 打通右侧会话边栏、overlay 二级详情入口到同一套技能/工具弹窗
- 新增 Tauri 命令读取和保存当前 Agent 的技能配置
- 新增 Tauri 命令读取和保存当前 Agent 的工具权限配置
- 技能列表优先接入运行中 gateway 的 `skills.status`，离线时退回本地已安装技能列表
- 工具权限使用 OpenClaw 核心工具目录进行勾选与保存

## 不包含

- 不扩展 `commands / channel / schedule` 的真实配置能力
- 不做插件工具发现或插件工具管理
- 不改现有聊天发送、停止生成、事件监听、会话切换逻辑
- 不替换现有记忆弹窗和模型弹窗架构

## 关键设计

### 1. 统一入口

- 右侧会话边栏点击“技能库”卡片，直接打开技能弹窗
- 右侧会话边栏点击“工具权限”卡片，直接打开工具权限弹窗
- overlay 中 skills/tools 入口复用同一套弹窗与同一份当前 Agent 状态

### 2. 技能配置数据流

- 先通过 `get_agent_skill_config(agent_id)` 读取当前 Agent 已保存的技能白名单
- gateway 已连接时，通过 websocket `request("skills.status")` 获取完整技能状态列表
- gateway 未连接时，退回 `list_skills()` 只展示本地已安装技能
- 若配置中存在当前列表缺失的技能名，则补为 synthetic row，标记 `Configured`
- 保存时调用 `save_agent_skill_config(agent_id, skill_names)`

### 3. 工具权限数据流

- 通过 `get_agent_tool_config(agent_id)` 读取当前 Agent 的原始工具权限结构
- 前端维护与 OpenClaw 一致的 `TOOL_GROUPS` 与 `TOOL_PROFILES`
- 把 `profile / allow / alsoAllow / deny` 解析为 UI 勾选状态
- 若配置中存在当前核心工具目录里没有的工具 id，则补为 synthetic row，标记 `Configured`
- 保存时调用 `save_agent_tool_config(agent_id, selected_tool_names)`

### 4. 后端保存策略

- `agents.list` 中按 `id` 精确定位 Agent；不存在时补最小条目 `{ id }`
- 技能保存时直接写入 `skills: string[]`
- 工具保存时：
  - 若勾选了全部核心工具且不存在额外未知工具项，则写 `{ profile: "full" }`
  - 其他情况统一写 `{ allow: [...] }`
- 每次工具保存都清空旧的 `profile / allow / alsoAllow / deny`，但保留其它非权限字段

### 5. 技能即时生效

- 保存技能后定位当前 Agent 的主会话 `sessions.json`
- 仅删除或置空该主会话条目的 `skillsSnapshot`
- 保留 `sessionId`、聊天 transcript、token 统计和 websocket 连接
- 下一条消息发送时由 OpenClaw 自动按新配置重建技能快照

## 对外接口

- `get_agent_skill_config(agent_id)` -> `{ agentId, selectedSkillNames }`
- `save_agent_skill_config(agent_id, skill_names)` -> `{ agentId, selectedSkillNames, appliesOnNextMessage }`
- `get_agent_tool_config(agent_id)` -> `{ agentId, profile, allow, alsoAllow, deny }`
- `save_agent_tool_config(agent_id, selected_tool_names)` -> `{ agentId, profile, allow, alsoAllow, deny }`

## 验收标准

- 点击右侧边栏里的“技能库”可弹出技能弹窗
- 点击右侧边栏里的“工具权限”可弹出工具权限弹窗
- 切换不同 Agent 后，两类弹窗都能回显各自独立配置
- 技能保存后重新打开可正确回显，且下一条消息按新技能配置生效
- 工具权限保存后重新打开可正确回显，且下一条消息按新权限生效
- 配置里存在未知技能名或未知工具 id 时，不会在保存时被静默丢失
- gateway 未启动时，技能弹窗仍可打开并显示降级数据；工具权限弹窗仍可编辑保存
- 不影响记忆弹窗、模型弹窗、聊天发送、停止生成、重置会话与切换 Agent

## 2026-05-02 Update

- 微调 `workspace-clone` 技能库弹窗的卡片布局与滚动留白，修复技能项 hover / 选中高亮在列表顶部与边缘被裁切的问题。
- 移除技能项右侧默认的 `Installed` / `Built-in` 类别标签，避免和分类切换信息重复，只保留真正需要提示的异常状态标签。
- 内置技能与安装技能共用同一套精简卡片样式，不改 `invoke()`、保存逻辑或后端命令签名。
