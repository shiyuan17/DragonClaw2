# Phase 5.15.7: 引导流程接入官方 SkillHub 安装器
> 状态：规划中
> 类型：前后端联动功能修复
> 前置阶段：Phase 5.15 首页聊天接入内置 OpenClaw

## 目标

修复首次引导里的推荐技能安装链路，让 DragonClaw 不再依赖旧版 gateway 的
`skills.search` / `skills.detail` 协议去 bootstrap `SkillHub`。

新的收尾流程保持现有引导 UI 不变，只复用 `launching` 阶段的加载页和
`progressMsg` 文案，按以下顺序执行：

1. 启动 OpenClaw 服务
2. 通过官方命令 `curl -fsSL https://skillhub.cn/install/install.sh | bash` 安装 SkillHub
3. 校验官方 CLI 与 bootstrap 技能已落到 DragonClaw 实际使用的 Windows 路径
4. 通过 SkillHub CLI 安装推荐技能：
   - `Summarize`
   - `agent browser`
   - `imap-smtp-email`
   - `opencli`
   - `Humanizer`
5. 安装收尾完成后进入 DragonClaw 主界面

## 范围

- 不新增新的引导页面，不修改 `SetupWizard` 的结构、样式和按钮布局
- 仅通过现有提示文本告知安装进度
- 首次引导继续执行这段推荐技能安装
- 对缺失 onboarding state 且实际未安装 SkillHub / 推荐技能的旧用户，自动补跑一次
- 任一技能失败时不重试、不阻塞后续技能，最终仍进入主界面

## 关键设计

### 1. 引导安装链路切换到官方安装器

- 前端保留 `useSetup -> finalizeStartup -> runOnboardingSkillInstall` 现有时序
- 删除 `src/utils/onboardingSkillInstaller.ts` 中对 gateway `skills.search`、
  `skills.detail`、`chat.send`、`sessions.reset` 的依赖
- 新增后端命令：
  - `install_official_skillhub()`
  - `install_skillhub_recommended_skill(slug, displayName)`
  - `get_skillhub_install_runtime_info()`
- SkillHub 的“已安装”语义改为：
  - 官方 CLI 已安装到用户目录
  - 或官方 bootstrap 技能 `find-skills` / `skillhub-preference` 已存在

### 2. Windows 路径映射

- DragonClaw 运行在 Windows，本地实际配置目录与工作区路径必须继续走 `paths::*`
- 当当前 `bash` 实际是 WSL bash 时，安装器执行前强制注入：
  - `HOME` -> Windows 用户目录对应的 WSL 路径
  - `OPENCLAW_CONFIG_PATH` -> Windows `~/.openclaw/openclaw.json` 对应的 WSL 路径
  - `OPENCLAW_WORKSPACE` -> Windows `~/.openclaw/workspace` 对应的 WSL 路径
- 这样官方安装器写出的：
  - `~/.skillhub`
  - `~/.local/bin/skillhub`
  - `~/.openclaw/workspace/skills/find-skills`
  - `~/.openclaw/workspace/skills/skillhub-preference`
  都会真实落到 Windows 用户目录，而不是写到 WSL Linux home

### 3. 推荐技能安装与状态持久化

- 推荐技能不再通过网关里的 `SkillHub` agent skill 安装
- 改为使用官方安装出的 SkillHub CLI，固定 slug 为：
  - `Summarize` -> `summarize`
  - `agent browser` -> `agent-browser`
  - `imap-smtp-email` -> `imap-smtp-email`
  - `opencli` -> `opencli`
  - `Humanizer` -> `humanizer`
- 每个技能安装目标目录固定到 `paths::main_workspace_dir()/skills`
- onboarding state 继续保存在 `paths::user_config_dir()/dragonclaw-onboarding.json`
- 若本轮全部成功，写入 `required=false, completed=true`
- 若官方安装器失败或任一技能失败，写入详细错误并保持 `required=true`

### 4. 技能可见性修复

- `list_skills()` 从双目录读取扩展为三目录合并读取：
  - `paths::main_workspace_dir()/skills`
  - `paths::user_config_dir()/skills`
  - `paths::user_config_dir()/workspace/skills`
- 前端技能库在线时继续读取 `skills.status`，但必须始终合并 `list_skills()` 结果
- 去重按规范化名称处理，兼容 `agent browser` / `agent-browser` 这类变体

## 验收标准

- 修复后，引导不再出现 `unknown method: skills.search`
- 首次引导页外观保持不变，只通过提示文本显示 SkillHub 安装进度
- 官方安装器产物落在 Windows 用户目录
- 推荐技能安装后，`paths::main_workspace_dir()/skills` 中能看到对应技能目录
- 在线 `skills.status` 返回不完整时，主技能库仍能通过 `list_skills()` 看到本地安装技能
- 缺失 state 且未安装技能的旧用户启动后会自动补跑一次
- 已完成安装的用户重复启动时不再重复安装
