# Phase 5.29: 首页未响应与 SkillHub 后台安装修复
> 状态: Planned
> 日期: 2026-05-03
> 类型: 前端性能 / 后台任务稳定性修复

## 背景

首页进入 `workspace-clone` 时会静态加载员工页模块，而员工页顶层会解析 `src/data/agency-agents.json`。该文件约 4.7 MB，其中绝大部分是完整员工模板正文；即使用户没有打开“数字员工”菜单，首屏也会承担大 JSON 解析和 roster 构建成本。

ready 后的 onboarding 推荐技能安装也会在首页刚出现时启动 SkillHub / npm / bash 任务。虽然重型命令已迁移到 blocking worker，但前端仍串行等待安装流程，容易与首页首次挂载竞争资源。

## 目标

- 拆分员工角色库数据，首页和员工列表首屏不再解析完整模板正文。
- 员工详情按需加载单个模板分片，保持加入/移除员工的现有命令契约。
- 将 SkillHub onboarding 推荐技能安装改为后端后台任务，ready 后只触发，不等待。
- 保持既有 Tauri command 签名和前端 `invoke()` 参数不变，仅新增兼容命令。

## 实施范围

### 1. 角色库数据拆分

- 用轻量 `agency-agent-roster.json` 承载 `schemaVersion`、`sourceRoot`、`rosterZhRaw`、`agentInfos`。
- 将每个员工的模板正文拆到 `agency-agent-templates/<agentId>.json`。
- 移除原大文件 `agency-agents.json`，避免前后端继续依赖整包 manifest。

### 2. 前端按需加载

- `agencyRoster.ts` 只同步加载 roster 数据，并通过 `import.meta.glob` 提供 `loadAgencyRoleDefinition(agentId)`。
- 员工列表用 info/roster 构建可搜索卡片和 fallback 定义；详情弹窗打开后再加载单个模板正文。
- `WorkspaceClonePage` 用 `React.lazy` / `Suspense` 懒加载员工页和技能市场页，降低首页默认 chunk 成本。

### 3. 后端按需加载

- 扩展 `build.rs`，构建时扫描模板分片并生成 Rust include 映射。
- `agency_agents.rs` 只 include 轻量 roster 数据；安装指定员工时再解析对应模板分片。
- `load_installed_agency_agent_ids` 只依赖 installable id 集合，不解析模板正文。

### 4. SkillHub 后台安装

- 新增 `start_onboarding_skill_install_background() -> OnboardingSkillInstallState`。
- 后端使用单例 guard 防止重复启动，后台串行执行官方 SkillHub、推荐 SkillHub 技能和 GitHub 技能安装。
- 后台任务继续写入现有 onboarding 状态，并通过 `service-log` 发出进度和错误日志。
- `useSetup` ready 后延迟/idle 触发新命令，不再等待完整安装流程。

## 验收标准

- `npm run build` 通过，首页默认 chunk 不包含员工模板正文，employees / skills 作为独立 lazy chunk。
- `cargo test --manifest-path src-tauri\Cargo.toml --lib` 通过。
- 首页 ready 后 3 秒内窗口可拖动、菜单可点击、聊天区域可交互。
- 首次打开“数字员工”列表快速出现；打开任一员工详情后模板正文正常加载。
- SkillHub 推荐技能安装在后台继续执行，失败只写日志和 onboarding 状态，不退回引导页。
