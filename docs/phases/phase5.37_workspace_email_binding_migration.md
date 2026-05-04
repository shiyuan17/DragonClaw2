# Phase 5.37: Workspace 邮箱绑定功能迁移

## Goal

将源项目中的个人邮箱绑定能力迁移到 `DragonClaw2` 的 `workspace-clone` 聊天工作区，在不影响 legacy 页面与既有频道绑定链路的前提下，为 composer 增加邮箱绑定入口、弹窗和 `imap-smtp-email` 技能兼容配置读写能力。

## Scope

- 仅在 `workspace-clone` 聊天工作区落地邮箱绑定，不扩散到 legacy chat / settings。
- 在 composer 区域新增 `邮箱` pill/button。
- 复用当前 React `Modal` 体系，不引入第二套弹窗框架。
- 前端新增独立 API、hook、modal 与类型，接口名保持与源项目一致，便于后续对照与复用。
- 后端新增独立 `src-tauri/src/email_binding.rs` 模块，不把逻辑继续塞进 `config.rs` 或 `channels.rs`。
- 配置路径统一经由 `paths.rs` 收口，兼容 `imap-smtp-email` 当前读取的 `~/.config/imap-smtp-email/.env`。

## Non-goals

- 不修改 `imap-smtp-email` 技能源码。
- 不补 legacy 页面第二入口。
- 不实现多账户编辑 UI；界面仅维护默认账号。
- 不改现有微信 / 飞书频道绑定流程。
- 不引入新的前端测试框架。

## Frontend Changes

### API and Types

- 新增 `src/api/emailSkillBinding.ts`
  - `loadImapSmtpEmailBinding()`
  - `saveImapSmtpEmailBinding(payload)`
- 在 `src/types/index.ts` 新增：
  - `EmailSkillBindingProvider`
  - `EmailSkillBindingSnapshot`
  - `SaveEmailSkillBindingPayload`
  - `EmailSkillBindingSaveResponse`

### State Layer

- 新增 `useWorkspaceEmailBinding` hook，负责：
  - modal `open / close`
  - 草稿读取与回填
  - `loading / saving`
  - `notice / error`
  - provider 归一化
  - 已绑定状态
  - 默认端口与协议
  - custom provider 校验

### UI

- 新增 `WorkspaceCloneEmailBindingModal`
  - provider
  - 邮箱账号
  - 授权码 / 应用专用密码
  - 自定义 IMAP / SMTP Host / Port
  - IMAP TLS
  - SMTP SSL
- 在 `WorkspaceCloneComposer.tsx` 增加邮箱入口 pill/button。
- 在 `WorkspaceClonePage.tsx` 挂载 hook 与 modal，并向 composer 透传状态与打开动作。
- 如需图标，统一放入现有图标映射或静态资源目录，不新建第二套视觉来源。

## Backend Changes

### Path Management

- 在 `src-tauri/src/paths.rs` 新增 `imap_smtp_email_env_path()`。
- 路径统一返回 `user_home_dir()/.config/imap-smtp-email/.env`。
- 业务逻辑中不直接拼接该路径。

### Module and Commands

- 新增 `src-tauri/src/email_binding.rs`。
- 注册 Tauri command：
  - `load_imap_smtp_email_binding`
  - `save_imap_smtp_email_binding`

### Save / Load Rules

- 支持 provider：
  - `qq`
  - `163`
  - `gmail`
  - `outlook`
  - `sina`
  - `sohu`
  - `custom`
- `.env` 输出格式保持与 `imap-smtp-email` 技能一致。
- 保存时：
  - 保留已有 named accounts
  - 保留已有 `ALLOWED_READ_DIRS` / `ALLOWED_WRITE_DIRS`
  - 若白名单缺失则默认补 `~/Downloads` 与 `~/Documents`
- 读取时：
  - 从 host 自动推断 provider
  - 返回 `hasAuthorizationCode`

## Public APIs

### Frontend

- `loadImapSmtpEmailBinding()`
- `saveImapSmtpEmailBinding(payload)`

### Backend

- `paths::imap_smtp_email_env_path()`
- `load_imap_smtp_email_binding`
- `save_imap_smtp_email_binding`

## Acceptance Criteria

- `workspace-clone` composer 可打开和关闭邮箱绑定弹窗。
- 首次无配置时，弹窗显示空草稿与默认端口值。
- 已有配置时，能正确回填 provider、账号、自定义 host / port / 协议。
- custom provider 缺字段或端口非法时，前端阻止保存并提示错误。
- 保存成功后，composer 邮箱入口切换为已绑定态。
- `~/.config/imap-smtp-email/.env` 被正确创建或更新。
- 已安装的 `imap-smtp-email` 技能仍可读取该配置。
- 现有微信 / 飞书频道绑定与主页聊天流程不受影响。

## Validation

- Rust 单测覆盖：
  - provider 模板映射
  - custom provider 校验
  - 端口范围校验
  - `.env` 构建保留 named accounts 与 allowlists
  - 读取现有 `.env` 时正确推断 provider 与 `hasAuthorizationCode`
- 前端手工验证覆盖：
  - composer 入口开关
  - 空配置草稿
  - 已配置回填
  - custom 校验
  - 保存后已绑定态
- 集成验收：
  - `npm run tauri dev` 可正常启动
  - 保存一次邮箱配置后技能兼容读取不回归
