# Phase 5.62: Windows 无 bash 的 SkillHub 技能安装兜底

> 状态：规划中
> 类型：Windows 安装链路修复 / 技能市场 + onboarding

## Summary

修复 Windows 上没有 `bash` 时 SkillHub 技能安装直接失败的问题，覆盖两条真实入口：

1. onboarding 推荐技能安装
2. `workspace-clone` 技能市场手动安装

保留现有 Tauri command 名称、参数和返回 shape，不改前端 `invoke()` 合同；后端改为按运行时能力自动选路：

- macOS / Linux / Windows + WSL/bash：继续走现有 bash 路径
- Windows 无 bash 但有 Python：走 Windows 原生 fallback
- 两者都不可用：返回明确前置条件错误，不再暴露内部 `bash` 依赖细节

## Ground Truth

- 当前外层官方安装器 `https://skillhub.cn/install/install.sh` 只负责下载一个 tar 包并转交给内部 `cli/install.sh`
- kit 内部真实产物包括：
  - `cli/skills_store_cli.py`
  - `cli/skills_upgrade.py`
  - `cli/version.json`
  - `cli/metadata.json`
  - `cli/skill/SKILL.md`
  - `cli/skill/SKILL.skillhub-preference.md`
- 内部安装脚本默认安装到：
  - `~/.skillhub`
  - `~/.local/bin/skillhub`
  - `~/.openclaw/workspace/skills/find-skills`
  - `~/.openclaw/workspace/skills/skillhub-preference`

## Key Changes

### 1. Runtime abstraction

- 在 `src-tauri/src/onboarding.rs` 中新增明确安装模式：
  - `bash-shell`
  - `windows-native`
  - `unavailable`
- `SkillHubInstallRuntimeInfo` 扩展为同时表达：
  - `bashAvailable`
  - `bashVersion`
  - `pythonAvailable`
  - `pythonVersion`
  - `installMode`
- 规则固定为：
  - 非 Windows：优先 `bash-shell`
  - Windows 有 bash：沿用现有 bash / WSL 逻辑
  - Windows 无 bash 且有 `python` 或 `py -3`：使用 `windows-native`
  - 否则 `unavailable`

### 2. Shared bootstrap helper

- 把“确保 SkillHub CLI 已可用”收口为共享 helper，供 onboarding 与技能市场共用
- 若官方 CLI 已安装则直接复用
- 若模式为 `bash-shell`，继续执行现有官方安装命令
- 若模式为 `windows-native`，直接按官方 kit 产物契约下载并写入：
  - `~/.skillhub/skills_store_cli.py`
  - `~/.skillhub/skills_upgrade.py`
  - `~/.skillhub/version.json`
  - `~/.skillhub/metadata.json`
  - `~/.local/bin/skillhub.cmd`
  - `~/.local/bin/oc-skills.cmd`
  - `~/.openclaw/workspace/skills/find-skills/SKILL.md`
  - `~/.openclaw/workspace/skills/skillhub-preference/SKILL.md`
- 继续复用现有校验逻辑确认安装结果

### 3. Skill install execution without bash hard dependency

- SkillHub 技能安装不再写死为 `bash -lc "python3 ..."`
- `bash-shell` 模式保持当前 shell 执行方式
- `windows-native` 模式直接启动已探测到的 Python 可执行文件：
  - `skills_store_cli.py --skip-self-upgrade --dir <target> install <slug> --force`
- 仅在 WSL/bash 路径做 Windows -> WSL 路径映射
- Windows 原生模式全部使用本机绝对路径，不走 shell quote / WSL path 转换

### 4. Skill market bootstrap before install

- `src-tauri/src/skill_market.rs` 中的 `install_skill_market_skill` 不再要求 SkillHub 预先安装
- 固定改为：
  1. 规范化 slug 和目标 Agent
  2. 调用共享 `ensure_skillhub_cli_installed()`
  3. 对每个目标目录执行安装
  4. 汇总成功 / 失败结果并保留现有返回风格

### 5. Frontend runtime messaging

- onboarding runtime 日志改为显示真实安装模式，而不是只显示 `bash unavailable`
- 技能市场安装失败时优先显示后端的前置条件错误
- 若运行时为 `unavailable`，安装确认按钮禁用并显示内联提示；其余交互保持不变

## Acceptance

- Windows 无 bash、有 Python 时：
  - 技能市场可直接安装 SkillHub 技能
  - onboarding 推荐技能可继续安装
- Windows 无 bash、无 Python 时：
  - 不再出现内部 `bash` 报错
  - 前端显示明确前置条件提示
- Windows + WSL/bash：
  - 现有安装链路不回退
- 多目标安装与重复安装行为保持现有语义

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run tauri dev`
- 手动验证：
  - 技能市场首次安装一个 SkillHub 技能
  - onboarding 推荐技能安装
  - Python 缺失场景前端提示
