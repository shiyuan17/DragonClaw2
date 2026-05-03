# Phase 5.20: Workspace 数字员工角色库同步

## Background

`workspace-clone` 当前已经有 `employees` 菜单入口，但仍然是占位页，无法承接旧仓库 `D:\Github\DragonClaw` 中已经存在的数字员工角色库与安装卸载体验。

同时，当前仓库已经具备 Agent 目录、注册表、workspace 路径与技能 / 工具配置能力，因此本阶段只需要把旧仓库的角色库与安装卸载链路接到 `workspace-clone > employees`。

## Scope

- 只改 `workspace-clone > employees` 入口
- 同步旧仓库数字员工角色库的：
  - 角色库展示
  - 部门分类
  - 关键词搜索
  - 安装加入
  - 已加入列表
  - 移除卸载
- 新增 3 个 Tauri 命令：
  - `install_agency_agent`
  - `uninstall_agency_agent`
  - `load_installed_agency_agent_ids`

## Out Of Scope

- 不修改 [`src/components/AgentsTab.tsx`](../../src/components/AgentsTab.tsx)
- 不同步团队协作、Team Workbench、团队任务
- 不改现有 `agents::*`、`provider_mgr::*`、`workspace-clone` 既有命令签名
- 员工页本次不负责跳转聊天，也不在安装后自动切回 `chat`

## Implementation Notes

### Shared roster data

- 从旧仓库 `agency-agents` 与 `generated/agency-agent-manifest.json` 生成一个共用数据包。
- 数据包需同时满足：
  - 前端可直接读取角色库、分类与角色详情
  - Rust 后端可直接读取模板文件并执行安装
- 中文角色库为默认展示来源。
- 若个别角色缺中文详情，前端读取详情时回退英文 `agentInfos`。

### Employee page

- 将 `activeMenu === "employees"` 从占位 compact panel 替换为真实员工管理页。
- 页面结构对齐旧仓库 `EmployeeRecruitmentPanel`：
  - 顶部说明与数量
  - 分类筛选
  - 搜索框
  - 错误提示
  - 已加入列表
  - 角色卡片列表
- 交互语义按本仓库本次方案调整：
  - 未安装：显示“加入”
  - 已安装：显示“已加入”
  - 已加入列表仅提供查看状态与移除，不触发聊天跳转

### Install / uninstall behavior

- `install_agency_agent` 仅允许安装角色库内的 agent id。
- 若目标角色已由角色库安装过，则返回成功，不重复创建。
- 若存在同名但非角色库托管的 Agent，则拒绝覆盖。
- 安装时：
  - 创建 `~/.openclaw/agents/<agentId>/agent/`
  - 复用 `main` 的 `models.json`
  - 将 `AGENTS.md + IDENTITY.md + SOUL.md` 按旧仓库生成规则拼成 `agent.json.systemPrompt`
  - 在 `~/.openclaw/workspace-dragonclaw/agency-agents/<agentId>/` 写入模板文件
  - 同步写入 `openclaw.json agents.list[]`
  - 标记该 Agent 为角色库托管来源，供卸载与列表识别
- `uninstall_agency_agent`：
  - 仅删除角色库托管 Agent
  - 禁止删除 `main`
  - 删除 agent 目录、registry 与受管 workspace
  - 若目标已不存在，则返回成功

## Validation

1. 文档先落地到本文件和 `docs/TODO.md`
2. 文档 commit 与代码 commit 分开
3. `npm run build`
4. `npm run tauri dev`
5. 手动验证：
   - 进入 `workspace-clone > employees`
   - 角色库、分类、搜索、已加入列表正常显示
   - 安装角色后原地变为“已加入”
   - `~/.openclaw/agents` 与 `openclaw.json agents.list[]` 正确写入
   - 重复安装不报错
   - 移除后页面原地刷新且文件被清理
   - `workspace-clone > chat`、频道绑定、模型 / 记忆 / 技能 / 工具弹层不回归

## Rollback

- 删除新增的角色库数据包、Tauri 命令与员工页组件
- 将 `employees` 菜单恢复为 compact placeholder
- 保留既有 Agent 管理与 `workspace-clone` 其他能力不动

## 2026-05-03 Follow-up: 数字员工中文名称统一显示

### Goal

在 `workspace-clone` 范围内统一将 Agent 的用户可见名称切换到中文展示来源，并将 `main` 显示为“主分身”。

### Scope

- 仅调整前端展示层，不修改任何 `invoke()` 契约、Rust command 签名、session key、agent id、安装/绑定逻辑
- 全局覆盖 `workspace-clone` 内所有 Agent 展示入口：
  - 左侧数字员工/会话目录
  - 当前会话头部标题
  - Agent 信息弹层
  - 记忆、技能库、工具权限弹窗标题
  - composer 的 `@Agent` 提示 fallback
  - 技能市场安装目标列表与 `main` 标记
  - 频道绑定弹窗里的数字员工选择器
- 不扩散到 legacy 区域或 `src/components/AgentsTab.tsx`

### Display Name Rules

- `agentId === "main"` 时，所有用户可见名称显示为 `主分身`
- 若 `agentId` 命中 `agency-agent-index.json` / `agencyRoster`，显示角色库中的中文 `name`
- 若未命中角色库，回退到当前 Agent 的自定义名 / identity name
- 最后才回退到原始 `agentId`
- 所有提交、安装、绑定、session 路由继续使用原始 `agentId`，只调整展示文本

### Search Compatibility

- 为避免中文展示后无法通过英文 slug 检索，目录搜索需同时命中：
  - 中文展示名
  - 原始 `agentId`
  - 现有 `subtitle`
- 员工市场页保持现状，因为其搜索文本本身已包含中文与 `agentId`

### Validation

1. `workspace-clone > chat > 数字员工` 中已安装角色显示中文名，不再显示 `engineering-*`
2. `main` 在目录、头部、弹窗、技能安装目标里都显示为“主分身”
3. 搜索框输入中文名可命中，输入原始英文 `agentId` 也能命中
4. 技能市场安装目标提交后仍使用原始 `agentId`
5. 频道绑定弹窗选择器显示中文名，但保存绑定后关联值仍是原始 `agentId`
6. 非 roster 管理的自定义 Agent 继续显示原有自定义名
