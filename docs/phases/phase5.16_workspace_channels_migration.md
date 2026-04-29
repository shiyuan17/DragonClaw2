# Phase 5.16: Workspace 频道功能迁移

> 状态：规划中
> 类型：前后端联动功能迁移
> 前置阶段：Phase 5.15 首页聊天接入、Phase 5.15.8 workspace 契约与安全收敛

## 目标

在不动 legacy tabs 的前提下，把 `workspace-clone` 首页聊天工作区的频道能力从静态占位升级为真实可用的目录、绑定与 onboarding 入口。

本期聚焦“完整频道体验迁移”，但不把旧版 Vue 工作台整套迁入 `DragonClaw2`，也不迁移旧版独立 channel runtime/history bootstrap。频道选中后继续复用其绑定 Agent 的主会话。

## 本次范围

### 包含

- 在 `workspace-clone` 左侧目录中按旧版展示 8 个频道平台：
  - 微信
  - 飞书
  - 企业微信
  - 钉钉
  - QQ
  - Telegram
  - WhatsApp
  - Discord
- 为微信接入真实二维码绑定链路：
  - 拉起二维码
  - 状态轮询
  - 刷新二维码
  - 绑定目标 Agent
- 为飞书接入真实 onboarding 链路：
  - 创建设备流二维码
  - 自动轮询结果
  - 自动回填 App ID / App Secret
  - 手动凭证输入兜底
  - DM 权限策略保存
- 目录区显示“已绑定频道会话卡片 + 平台目录卡片”两层结构
- 支持频道右键菜单与解绑操作
- 频道选中后把首页主聊天区切换到其绑定 Agent 的主会话
- 新增频道专用 Tauri command、Rust 类型与前端 API 封装

### 不包含

- 不迁移旧版 Vue 侧完整 `DirectoryPanel`、`WorkspaceMainLayout`、runtime logs 与 channel session bootstrap 体系
- 不改 `AgentsTab.tsx`
- 不把其他 6 个平台接入真实 token / webhook / bot onboarding
- 不新增独立频道会话模型
- 不修改现有首页 agent 聊天网关协议

## 功能策略

### 目录与聊天联动

- `workspace-clone` 中的频道实体需要保留：
  - `channelId`
  - `channelAccountId`
  - `runtimeAgentId`
- 已绑定频道显示在目录上方的频道会话区域；未绑定平台保留在下方平台目录卡片区
- 当用户选中已绑定频道时：
  - 目录与头部文案显示当前频道上下文
  - 主聊天区复用绑定 Agent 的 `agent:<agentId>:main` 会话
- 当用户选中未绑定频道时：
  - 不发送聊天请求
  - 主聊天区显示空态提示，引导先完成绑定

### 平台支持策略

- 8 平台统一展示目录和图标，保持产品层完整感
- 微信与飞书做真实接入
- 其余 6 平台仅展示“暂未开放自动接入”的绑定弹窗占位，不落真实配置，不发明未经验证的协议字段

## 后端改动

### 新增命令

保持与旧仓库一致的命令名与 payload 形状：

- `load_openclaw_channel_accounts_snapshot`
- `load_openclaw_channel_form_values`
- `save_openclaw_channel_config`
- `save_openclaw_channel_binding`
- `remove_openclaw_channel_config`
- `start_openclaw_channel_qr_binding`
- `poll_openclaw_channel_qr_binding`
- `clear_openclaw_channel_qr_binding_session`
- `request_feishu_openclaw_qr`
- `poll_feishu_openclaw_qr_result`

### 实现约束

- 频道配置读写统一复用当前项目的：
  - `config::read_openclaw_config()`
  - `config::write_openclaw_config()`
  - `paths::user_config_dir()`
- 写入时只修改 `channels` 相关节点，不能覆盖：
  - `models`
  - `agents`
  - `gateway`
- 微信 / 飞书 onboarding 逻辑从旧仓库迁入后，按当前项目模块边界拆分
- 保留以下安全与稳定性能力：
  - 二维码轮询会话清理
  - 外链安全校验
  - 飞书凭证回填
  - 错误信息收敛

## 前端改动

### 数据与类型

- 新增频道 API 模块，封装上述 Tauri commands
- 扩展 `src/types/index.ts` 与 `workspace-clone` 内部类型，补齐：
  - 频道快照 response
  - 频道配置 payload
  - 频道绑定 payload
  - 微信二维码会话快照
  - 飞书 onboarding response
  - 频道目录实体与绑定弹窗状态

### 资源与界面

- 把旧仓库频道图标资源迁入 `DragonClaw2`
- 用真实的 8 平台目录源替换 `workspaceCloneData.ts` 中现有静态频道占位
- 把当前 `WorkspaceClonePage` / `WorkspaceCloneDirectory` / `WorkspaceCloneChannelBindingModal` 的静态频道状态改为真实数据驱动

### 绑定弹窗

- 微信：
  - 显示二维码
  - 轮询状态
  - 刷新二维码
  - 选择并保存目标 Agent
- 飞书：
  - 创建设备流二维码
  - 自动轮询创建结果
  - 手动 App ID / App Secret 输入兜底
  - 保存 DM 权限策略
- 其他平台：
  - 展示“暂未开放自动接入”
  - 不落真实配置

## 验收标准

- `docs/phases/phase5.16_workspace_channels_migration.md` 与 `docs/TODO.md` 先落地
- 文档 commit 与代码 commit 分开
- `npm run tauri dev` 能正常启动
- 首页 `workspace-clone` 频道目录展示 8 平台，搜索、切换、折叠正常
- 微信绑定可以拉起二维码、轮询状态、保存绑定，并把结果写入 `~/.openclaw/openclaw.json`
- 飞书二维码链路与手动凭证保存都可用，并能写入 `channels.feishu`
- 删除绑定只清理目标频道配置，不影响 `models`、`agents`、`gateway`
- 绑定后的频道选中会进入对应 Agent 主会话
- 未绑定频道显示空态提示，而不是错误聊天态
- 现有 Agent、模型、memory、skills、tools 能力不回退
- `open_console`、服务启动、首页 agent 聊天链路保持可用

## 遗留说明

以下内容留到后续阶段：

- 频道独立聊天历史与 runtime log bootstrap
- 6 个非微信/飞书平台的真实接入
- 频道相关资源在右侧抽屉内的更深联动
- 更完整的频道多账号扩展策略
