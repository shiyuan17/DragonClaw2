# Phase 5.20.1: Workspace 数字员工列表刷新修复

## Background

`workspace-clone > employees` 已经支持安装和移除数字员工，但当前刷新链路只更新了员工页自己的已加入列表。聊天页左侧数字员工目录仍然依赖旧的网关 / 本地缓存快照，因此新增或移除员工后，用户通常需要重启应用或等待下一次完整网关初始化，才能在 `workspace-clone > chat` 中看到最新列表。

同样的问题也会影响频道绑定弹窗里的数字员工选择器，因为它使用独立的 `list_agents` 拉取链路，没有和员工页的安装/移除结果建立统一同步。

## Goal

- 修复 `workspace-clone > employees` 安装 / 移除数字员工后，`workspace-clone > chat` 左侧数字员工目录不刷新的问题
- 同步刷新频道绑定弹窗中的数字员工选择器
- 在网关未连接或本地仍使用缓存快照时，也能通过 `list_agents` 立即看到最新 roster
- 不修改任何 Rust command 签名，不改现有 `invoke()` 契约，不自动跳转聊天页

## Scope

### In Scope

- 给 `WorkspaceCloneEmployeesView` 增加内部回调，用于通知父级“数字员工 roster 已变化”
- 在 `WorkspaceClonePage` 统一串起：
  - 聊天 hook 的本地 roster 刷新
  - 网关在线时的 `agents.list` 强制 reload
  - 频道绑定数据刷新
- 在 `useWorkspaceGatewayChat` 中新增公开的本地 roster 刷新方法，底层复用 `invoke("list_agents")`
- 聊天 hook 初始化时，在读取 `list_workspace_agent_cache` 后补一次 `list_agents` 本地刷新

### Out Of Scope

- 不改 `install_agency_agent` / `uninstall_agency_agent` / `load_installed_agency_agent_ids` / `list_agents` 的后端实现与签名
- 不新增自动跳转到 `chat` 的行为
- 不自动切换到刚新增的数字员工
- 不改现有聊天消息、历史、技能、工具、记忆等业务语义

## Implementation Notes

### Employee page callback

- `WorkspaceCloneEmployeesView` 新增 `onAgentRosterChanged?: () => Promise<void> | void`
- 安装 / 移除成功并完成 `load_installed_agency_agent_ids` 刷新后，调用该回调
- 回调只做 best-effort 刷新：
  - 若失败，不回滚安装 / 移除结果
  - 页面仍然显示成功或失败反馈，以员工页本地结果为准

### Workspace-level roster sync

- `WorkspaceClonePage` 增加统一的 roster 同步处理器，固定顺序如下：
  1. 先刷新聊天 hook 的本地 agent roster 兜底
  2. 若网关已连接，再调用聊天 hook 的 `reload()`，强制重新拉取 `agents.list`
  3. 调用 `workspaceChannels.refreshChannels()`，刷新频道绑定弹窗的员工候选项
- 三步都按 best-effort 执行，互不阻断

### Local roster fallback in chat hook

- `useWorkspaceGatewayChat` 新增公开方法，用 `invoke("list_agents")` 拉取本地 agent 列表
- 将 `AgentInfo[]` 转成兼容 `WorkspaceGatewayAgentsListResult` 的前端结构，作为离线 / 缓存态的最新真相
- 组装本地结果时：
  - 优先复用当前网关 / 缓存结果里已存在的 `name` / `identity`
  - 新加入但暂无 identity 的 agent 仅保留 `agentId`，交给现有显示名兜底逻辑处理
- 本地刷新后继续沿用现有选中语义：
  - 当前选中员工仍存在则保持
  - 若当前选中员工已被移除，则回退到 `default/main`，再不行回退到首个可用员工
  - 不主动创建新会话，不清空其它员工历史

## Validation

1. 从 `workspace-clone > employees` 新增一个数字员工，不重启应用，切回 `chat` 后左侧目录立即出现新员工
2. 服务未连接或聊天页仅使用本地缓存时，重复上述操作，目录仍然立即刷新
3. 删除一个已安装员工后，聊天目录与频道绑定弹窗中的数字员工选择器同步移除该员工
4. 若删除的是当前选中员工，聊天页平滑回退到 `main` 或首个可用员工，不报错、不白屏
5. 现有聊天消息、会话历史、技能 / 工具 / 记忆弹层不回归
6. 提交前执行：
   - `npm run check:encoding`
   - `npm run check:file-size`
   - `npm run tauri dev`
   - 手动验证“启动服务 → 打开网关 → 聊天正常”

## Commit Plan

1. 文档提交：
   - 新增本 Phase 文档
   - 更新 `docs/TODO.md`
2. 代码提交：
   - 员工页回调
   - 聊天 hook 本地 roster 刷新
   - 页面级统一同步处理器
