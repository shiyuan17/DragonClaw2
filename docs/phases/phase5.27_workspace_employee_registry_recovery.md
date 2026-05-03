# Phase 5.27: Workspace 数字员工注册自愈与聊天目录同步修复

> 状态：规划中
> 类型：后端自愈 + 前端刷新联动
> 前置阶段：Phase 5.20 数字员工角色库同步、Phase 5.15 首页聊天接入内置 OpenClaw

## 目标

修复当前两个同源问题：

- 在 `workspace-clone > employees` 中重复加入已经存在于磁盘的数字员工时，页面提示“加入失败”
- 在 `workspace-clone > chat` 首页聊天目录中，已经加入的数字员工没有显示

根因是：`~/.openclaw/agents/<agentId>` 和 `~/.openclaw/workspace-dragonclaw/agency-agents/<agentId>` 已经存在，但 `~/.openclaw/openclaw.json` 的 `agents.list` 丢失了对应托管条目，导致：

- `install_agency_agent` 把现有目录误判为“非角色库托管冲突”
- `load_installed_agency_agent_ids` 无法识别这些员工已经加入
- 首页聊天目录依赖网关 / 配置里的 agent 列表，因而看不到这些员工

## 范围

### 本次包含

- 在 `src-tauri/src/agency_agents.rs` 为角色库员工增加“缺登记但磁盘已存在”的托管自愈逻辑
- 修复“已加入状态”读取逻辑，使其不再只依赖 `agents.list`
- 在 `workspace-clone` 数字员工页和聊天页之间补目录刷新链路
- 为上述场景补 Rust 单测

### 本次不包含

- 不修改任何现有 Tauri command 签名
- 不修改网关协议结构
- 不展开追查哪条历史配置写入链路覆盖了 `agents.list`
- 不改动 `invoke()` 命令名、参数名和返回类型

## 关键设计

### 1. 角色库托管安装自愈

- 仅针对角色库内的 `agent_id`
- 当同时满足以下条件时，视为“可恢复的已安装数字员工”：
  - `~/.openclaw/agents/<id>` 存在
  - `~/.openclaw/workspace-dragonclaw/agency-agents/<id>` 存在
  - `AGENTS.md`、`IDENTITY.md`、`SOUL.md` 三个模板文件齐全
- `install_agency_agent` 命中该场景时：
  - 不再报“已存在同名 Agent，且不属于角色库托管”
  - 直接把托管条目补回 `openclaw.json > agents.list`
  - 保持写入字段：
    - `id`
    - `workspace`
    - `dragonclawManagedSource`
    - 继承主 Agent 的 `model.primary`

### 2. 已加入状态读取自愈

- `load_installed_agency_agent_ids` 不再只信任 `agents.list`
- 读取时同时检查：
  - 角色库 installable id
  - `~/.openclaw/agents/<id>` 目录
  - `~/.openclaw/workspace-dragonclaw/agency-agents/<id>` 目录及模板文件
- 对于识别出的“可恢复员工”，在返回已加入列表前自动补回 registry，避免下次仍丢失

### 3. 首页聊天目录刷新

- `WorkspaceCloneEmployeesView` 新增内部回调接口：
  - `onRosterChanged?: () => void | Promise<void>`
- 安装成功或移除成功后通知父层刷新
- `WorkspaceClonePage` 接到通知后先执行 `homepageChat.reload()`
- 目标是保证用户从“数字员工”页切回“聊天”页时，目录立即可见最新员工列表
- 本次优先不自动重启服务；若后续发现运行中的网关不会重新读取登记，再单独补服务重启联动

## 验收

1. 文档先落地到本文件和 `docs/TODO.md`
2. 文档 commit 与代码 commit 分开
3. Rust 单测通过：
   - 缺 `agents.list` 条目但磁盘已存在的角色库员工，可以通过 `install_agency_agent` 自愈恢复
   - 同样场景下 `load_installed_agency_agent_ids` 能返回该员工 id
   - 原有首次安装 / 重复安装 / 卸载幂等测试保持通过
4. 手动验证：
   - 当前现场中的 `engineering-frontend-developer`、`engineering-backend-architect` 会显示为“已加入”
   - 再次点击“加入前端开发者”不再报错
   - 切回聊天页后，目录中可以看到恢复后的数字员工
   - 新装一个未加入数字员工后，数字员工页状态与聊天目录同步更新
   - 卸载一个角色库员工后，数字员工页和聊天目录同步移除

## 回滚

- 删除 `agency_agents.rs` 中新增的 registry 自愈逻辑与对应测试
- 移除 `WorkspaceCloneEmployeesView` 的 roster change 回调
- 恢复 `WorkspaceClonePage` 现有聊天目录刷新行为
