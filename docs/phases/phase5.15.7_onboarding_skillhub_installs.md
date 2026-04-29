# Phase 5.15.7: 引导流程接入 SkillHub 技能安装

> 状态：规划中
> 类型：前后端联动功能补齐
> 前置阶段：Phase 5.15 首页聊天接入内置 OpenClaw

## 目标

在不改变现有引导界面结构、样式、按钮与布局的前提下，把首次启动的推荐技能安装收尾接入到现有启动流程。

本次流程固定为：

1. 启动 OpenClaw 本地 gateway
2. 通过官方 `skills.search` / `skills.install` 协议安装 `SkillHub`
3. 将 `SkillHub` 写入 `main` Agent 的技能配置
4. 由 `SkillHub` 继续安装以下技能：
   - `Summarize`
   - `agent browser`
   - `imap-smtp-email`
   - `opencli`
   - `Humanizer`
5. 安装完成后清理临时会话，再进入 DragonClaw 主界面

## 范围

- 仅复用现有引导加载页，不新增新的引导 UI
- 仅通过 `progressMsg` 和现有说明文案提示当前安装进度
- 首次引导时执行技能安装收尾
- 已有用户升级后不自动补跑
- 任一技能失败时不中断后续项，也不在引导阶段重试

## 关键设计

### 1. 引导阶段复用

- 继续使用现有 `launching` 阶段承载技能安装收尾
- `useSetup` 在服务可用后，先判断是否需要执行首次技能安装
- 若需要，则更新进度文本并执行安装链路；执行完毕后再切换到 `ready`

### 2. 首次引导状态持久化

- 在 `paths::user_config_dir()` 下新增引导状态文件
- 新增命令：
  - `get_onboarding_skill_install_state()`
  - `save_onboarding_skill_install_state(payload)`
- 状态字段至少包括：
  - `required`
  - `completed`
  - `skipped`
  - `results`
  - `lastAttemptAt`

### 3. SkillHub 安装链路

- `SkillHub` 本身由官方 gateway 协议 bootstrap
- `SkillHub` 安装成功后，调用现有 `save_agent_skill_config("main", [...])`
- 清空 `main` 会话的旧 `skillsSnapshot` 后，通过临时主会话向 `main` Agent 发送安装任务
- 任务只允许通过 `SkillHub` 安装其余 5 个技能
- 安装结束后，再调用 `skills.status` 做最终校验
- 会话结束后调用 `sessions.reset` 清理本次临时安装痕迹

### 4. 本地技能读取补齐

- 扩展 `list_skills()`
- 合并读取：
  - `~/.openclaw/skills`
  - 默认 workspace 下的 `skills/`
- 去重后统一返回，保证离线和降级场景也能看到首次引导安装结果

## 验收标准

- 首次安装时，引导页面外观保持不变，只看到现有提示文本逐步切换为技能安装进度
- 安装顺序固定为 `SkillHub -> Summarize -> agent browser -> imap-smtp-email -> opencli -> Humanizer`
- 任一技能失败时不阻塞后续安装，最后仍能进入主界面
- 引导结束后，用户首次进入聊天页时不保留本次技能安装会话内容
- 在线时 `skills.status` 能看到安装结果，离线时 `list_skills()` 也能看到 workspace skills
- 已有用户升级后不会被强制重新进入该安装收尾流程
