# DragonClaw - 开发任务总表 (AI 开发规范版)

## Phase 5.41: State and Config Consolidation
- [ ] 收口 openclaw.json 写入口、服务生命周期结构化真源与 Control UI 预构建路径，不改变既有 Tauri command 签名或前端 invoke() 协议。

## Phase 5.40: Large Module Split
- [ ] Split homepage chat, workspace ready-page controllers, and channel backend into smaller internal modules without changing Tauri command signatures or frontend invoke contracts.
- [ ] Add enforceable large-file guardrails for frontend pages/hooks and Rust modules so active split work does not recreate new oversized files.

## Phase 5.39: Chat Startup and Gateway Stability
- [ ] Move ready-workspace service startup feedback into an independent in-chat panel and stabilize gateway WebSocket/RPC readiness.

## Phase 5.38: 一次引导与常驻服务快启
- [ ] 引入独立 Launcher 状态文件，区分首次引导与后续快启路径，并让 DragonClaw 退出后继续复用常驻 OpenClaw 服务。

## Phase 5.37: Workspace 邮箱绑定功能迁移
- [ ] 将 `workspace-clone` composer 邮箱绑定入口、React modal、`imap-smtp-email` 兼容配置读写与独立 Tauri command 迁移到项目中，并限定只影响聊天工作区。

## Phase 5.37: workspace-clone Slash Command 迁移
- [ ] 在 `workspace-clone` 中迁移全局共享 Slash Command，支持系统默认/用户自定义两类模型，首版完整落地自定义命令的管理、`/` 联想、激活态展示与发送生效链路

## Phase 5.35: workspace-clone 存量乱码文案清理
- [ ] 清理 `workspace-clone` 中残留的错码中文文案与提示语，限定为前端渲染层字符串修复，不改动 `invoke()`、事件处理和后端接口

## Phase 5.33: OpenClaw 网关启动失败修复
- [ ] 将数字员工托管元数据移出 `openclaw.json`，自动清理旧 `dragonclawManagedSource` 字段，并修复 OpenClaw 2026.4.27 网关启动失败

## Phase 5.32: 首页无响应崩溃的服务心跳与日志风暴修复
- [ ] 修复 OpenClaw 服务心跳线程叠加、Windows PowerShell 进程探测和高频日志事件导致的首页无响应/AppHang 风险，保持既有 Tauri command 签名不变

## Phase 5.29: 首页未响应与 SkillHub 后台安装修复
- [ ] 拆分 `agency-agents.json` 为轻量 roster 与按 Agent ID 分片模板，员工页/技能市场懒加载，员工详情按需加载模板，并将 onboarding SkillHub 推荐技能安装切到后端后台任务

## Phase 5.20: 数字员工中文名称统一显示
- [x] 在 `workspace-clone` 内统一将 Agent 展示名切到角色库中文名称来源，并将 `main` 的所有用户可见名称显示为“主分身”，同时保留英文 `agentId` 搜索与内部绑定/安装语义不变

## Phase 5.15.9: 首页收缩侧边栏视觉重设计
- [x] `workspace-clone` 首页收缩态侧边栏改为参考图风格的双轨轻量导航，统一左侧菜单轨与右侧迷你目录轨的卡片节奏、间距、阴影和选中态

## Phase 5.15.11: `workspace-clone` 全域悬浮高亮统一
- [ ] 为 `workspace-clone` 左侧菜单、第二栏、主区头部、drawer、composer、popover 与专属弹层统一可用态 hover / focus-visible 高亮反馈，并保持 `active > hover > default`、`muted/disabled` 语义不变

## Phase 5.11: 旧 logo 切换为新 logo 引用
- [ ] 前端所有旧 `logo.jpg` 展示位统一切换到新的 DragonClaw 龙形 logo，并移除默认 Vite favicon 引用

## Phase 5.10: DragonClaw 主控制界面整页克隆
- [x] 默认首页切换到整页克隆工作台，并完成旧 `legacy` 控制台壳层与 `open_console` 的退役收口

## Phase 5.8: 引导流程静默自动启动
- [ ] 引导流程在环境/配置就绪后自动启动 OpenClaw 服务，首次无配置时自动落地默认工作区并直通主界面，且不自动打开 OpenClaw 页面

## Phase 5.9: Git 忽略规则清理
- [x] 排除 `node_modules` 出 Git 提交范围，并从索引中移除已跟踪依赖目录

> 本文件用于追踪项目的整体进度，由 AI 或开发者在完成特定功能后打勾更新。它作为跨越多个 Context 的长期记忆与进度锚点。

## 📂 项目结构与文档规范 (当前)
- [x] 输出完整商业 PRD (`/docs/PRD.md`)
- [x] 建立阶段性开发文档 (`/docs/phases/*.md`)
- [x] 建立并维护此全局任务表 (`/docs/TODO.md`)

## Phase 1: MVP 核心安装器
- [x] 搭建 Tauri + React 基础项目脚手架
- [x] 实现 Rust 下 Node.js 下载与本地释放
- [x] 实现源码 ZIP 网络拉取与解压
- [x] 实现 `npm install` + 镜像自动切换
- [x] 实现基础控制台 UI
- [ ] [Phase 1 测试]: 纯净版 Windows/Mac 虚拟机无报错启动

## Phase 2: "Aha Moment" 体验改善
- [x] 配置注入: 自动生成 `openclaw.json`
- [x] 配置注入: 自动生成 `models.json`
- [x] 工作区向导: 首次启动弹出文件夹选择
- [x] 启动后自动打开浏览器
- [x] UI 升级: 状态大卡片
- [x] 人话日志: 日志翻译层 + 原始/人话切换
- [x] 预置技能包
## Phase 2.5: 稳定性兜底
- [x] pnpm.cjs 路径动态探测
- [x] 端口占用检测 + 自动换端口
- [x] 服务进程崩溃检测
- [x] CMD 弹窗隐藏 (CREATE_NO_WINDOW)
- [x] Gateway 正确启动 (gateway + --allow-unconfigured + --port)
- [x] Gateway Auth Token 自动配置
- [x] 自动端口选择 (18789-18799 扫描)
- [x] Windows 中文用户名路径编码兼容
- [x] Windows 260 字符长路径限制处理
- [x] 完全断网友好提示
- [x] 磁盘空间预检查
## Phase 3: v1.0 上线版本 - UI 重构 + API Key 配置

### 必要功能 (Must-Have)

#### API Key 配置引导
- [x] API Key 首次引导页面 (SetupPage)
- [x] 主流提供商列表 (Nvidia/OpenRouter/Groq/智谱GLM/阿里百炼/字节方舟/DeepSeek/OpenAI/Kimi)
- [x] API Key 输入框 + 保存
- [x] 自定义中转站支持 (Base URL + API Key)
- [x] 配置写入 OpenClaw 配置系统
#### 模型选择与切换
- [x] 模型选择页面 (ModelPage)
- [x] 根据已配置 Key 显示可用模型列表
- [x] 一键切换默认模型
#### UI 大重构
- [x] Tab 导航布局 (仪表盘 / 模型 / 设置 / 日志)
- [x] 仪表盘: 服务状态 + 启停 + 打开网页端
- [x] 设置页: 端口、版本、工作区
- [x] 日志页: 单独页面，给开发者用
- [x] 精致深色主题 (渐变/半透明/微动效)
#### 后端 Tauri 命令
- [x] `save_api_config(provider, api_key, base_url)` 保存配置
- [x] `get_current_config()` 读取当前状态
- [x] `set_default_model(model_id)` 切换模型
- [x] `get_providers()` 获取提供商列表
- [x] `open_provider_register()` 打开注册页
### 高级功能 (v1.1+ Later)
- [ ] Google Gemini OAuth 一键登录
- [ ] ChatGPT OAuth 登录
- [ ] Ollama 本地模型集成
- [ ] System Tray 后台守护
- [ ] 代理/网络自动检测修复
- [ ] 日志导出一键打包
- [ ] i18n 国际化
## Phase 3.5: Premium UI 重构与体验打磨 (Next)
- [x] **视觉重构**: 引入极简深色高级皮肤 (毛玻璃、纯黑底色、微妙渐变)
- [x] **导航精简**: 移除主级“日志”Tab，将其并入“设置”作为二级栏目
- [x] **设置重构 (子路由)**:
  - [x] `通用`: 主题切换 (明/暗)、开机自启开关
  - [x] `日志`: 简化展示层，增加[一键导出日志] ZIP 功能
  - [x] `关于`: 版本信息、检查更新机制
  - [x] `开源社区`: 排版推荐开源项目及链接
- [x] **仪表盘美化**: 去线框化，状态灯与模型展示极简处理
- [x] **模型页重构**: 网格布局 + 弹窗 (Modal) 配置交互

## Phase 4: 架构重构
- [x] Stage 1: 基础设施 (types/utils 提取) `v2-stage1-complete`
- [x] Stage 2: 通用 UI 组件 (Modal) `v2-stage2-complete`
- [x] Stage 3: 页面组件拆分 (Header/ApiKeyModal/SetupWizard) `v2-stage3-complete`
- [x] Stage 4: Custom Hooks (`useLogs/useConfig/useService`) `v2-stage4-complete`
- [x] Stage 5: 后端 Rust 模块拆分 `v2-stage5-complete`
- [x] Stage 6: Provider 数据外置 `v2-stage6-complete`

## Phase 4.5: 架构打磨 (消除协作瓶颈)
- [x] Stage 7: CSS 模块化拆分 `v2-stage7-complete`
- [x] Stage 8: Tab 页面组件拆分 `v2-stage8-complete`
- [x] Stage 9: config.rs 职责拆分 `v2-stage9-complete`

## Phase 4.6: 最终打磨 (App.tsx -> ~150 行)
- [x] Stage 10: 弹窗组件提取 `v2-stage10-complete`
- [x] Stage 11: useService Hook 拆分 `v2-stage11-complete`

## Phase 5: UI 风格统一 (配色 + 图标一致性)
- [x] Stage 12: 色彩体系重置 `v2-stage12-complete`
- [x] Stage 13: Emoji -> Lucide 图标统一 `v2-stage13-complete`
- [x] Stage 14: 内联色值清理 `v2-stage14-complete`

## Phase 5.1: UX 细节打磨
- [x] Stage 15: Tab 切换抖动修复 + 表单宽度优化 + 弹窗跳动修复 + 残余绿色清理 `v2-stage15-complete`

## Phase 5.2: 日志诊断面板优化
- [x] Stage 16: 日志面板简化 + 导出诊断 ZIP `v2-stage16-complete`

## Phase 5.3: 关于页面优化
- [x] Stage 17: 版本检查 (GitHub API + 旋转动画) + 二维码替换 `v2-stage17-complete`

## Phase 5.4: 安装界面 Premium 优化
- [x] Stage 18: 启动画面极光浮动重构 `v2-stage18-complete`

## Phase 5.5: 仪表盘体验优化 + 端口扩展
- [x] Stage 19: 全局启动加载框 + Logo 替换 + 脉冲光效 + 端口范围扩展 `v2-stage19-complete`

## Phase 5.6: 自定义模型 ID 输入
- [x] Stage 20: ApiKeyModal + ModelSwitchModal 支持手动输入模型 ID `v2-stage20-complete`

## Phase 5.7: 多平台稳定性修复
- [x] OpenClaw 版本锁定 (`download.rs` pin `v2026.2.6-1` + `.openclaw_version` 标记 + 自动版本检测) `v0.4.1`
- [x] node-llama-cpp 智能重试 (`installer.rs` 检测 postinstall 崩溃 -> `NODE_LLAMA_CPP_SKIP_DOWNLOAD=true` 重试) `v0.4.2`
- [x] Ubuntu 闪退修复 (`environment.rs` 替换 unsafe `Statvfs` FFI 为 `df` 命令) `v0.4.3`
- [x] Windows node-llama-cpp 兼容性增强 (`installer.rs` 扩展检测 + `SKIP_BUILD` 跳过源码编译) `v0.4.4`
- [x] 发版流程规范化 (`AGENTS.md` 新增版本同步清单 + Release Notes 模板) `v0.4.1`
- [x] GPL-3.0 许可证切换 + 43 文件版权头 + README_EN 同步 `v0.4.1`
- [x] Phase 5.17: 升级内置 OpenClaw 到 `v2026.4.27`，并完成旧安装自动重装、全新安装、gateway 握手与首页聊天链路回归验证

---

## V3 路线图 (`v3-dev` 分支)
> **三端验收**: 所有 V3 改动必须在 Windows / Linux / macOS 三端验证通过。
> **UI 规范**: 遵循现有深色主题配色 (`--bg-*`, `--accent-*`)、Lucide 图标体系、`framer-motion` 动画。
### Phase 7: System Tray + 启动更新检查 -> `v0.5.0`
- [ ] System Tray 托盘图标 + 右键菜单 (打开面板/浏览器/重启/退出)
- [ ] 关闭窗口 -> 最小化到托盘，服务不中断
- [ ] 托盘图标动态状态 (运行中 / 已停止)
- [ ] 启动自动检查更新 (GitHub API -> 弹窗 -> "前往下载")
- [ ] 断网/无更新时静默忽略

### Phase 8: 智能体 + AI 引擎增强 -> `v0.6.0`

#### 8.1 AI 引擎改版 - 多 Provider 管理
- [x] 5-Tab 导航扩展 (仪表盘 / AI 引擎 / 智能体 / 数据统计 / 设置)
- [ ] AI 引擎页面改版: 已保存 Provider 卡片列表
- [ ] 添加 / 编辑 / 删除 Provider
- [ ] ApiKeyModal 高度优化: 默认展示 3 选项无需滚动

#### 8.2 Agent 管理增强
- [x] Agent 卡片网格基础展示
- [ ] 创建 Agent: 名称 + 模型下拉 + 系统提示词
- [ ] 编辑 Agent: 切换模型 + 修改提示词 + 权限
- [ ] 删除 Agent -> 同步清理 openclaw.json + workspace
- [ ] 权限控制: `subagents.allowAgents` 配置
- [ ] openclaw.json agents.list 同步

#### 8.3 Agent 对话 + 会话
- [ ] 卡片“对话”按钮 -> 浏览器打开 agent 会话
- [ ] 会话历史列表展示 + 点击恢复

#### 8.4 其他
- [x] 数据统计 Tab 占位页面
- [ ] 数据统计页面滚动条修复
- [x] 已安装技能列表展示
### Phase 9: 平台接入配置 -> `v0.7.0`
- [ ] config.rs 重构: 字符串拼接 -> `serde_json::Value` 结构化读写
- [ ] Telegram 配置引导 (BotFather -> Token -> 策略)
- [ ] Discord 配置引导 (Dev Portal -> Token -> 权限)
- [ ] 飞书配置引导 (开放平台 -> App ID/Secret -> 事件订阅)
- [ ] 平台连接状态展示 + 编辑/删除

### Phase 10: i18n + Ollama + 数据统计 -> `v0.8.0`
- [ ] i18n 国际化 `react-i18next` (zh-CN + en)
- [ ] 设置页语言切换
- [ ] Ollama 检测 + 本地模型列表 (整合到 AI 引擎页面)
- [ ] 数据统计 Tab: 请求量趋势折线图
- [ ] 数据统计 Tab: Token 用量卡片 (输入/输出/总计)
- [ ] 数据统计 Tab: 模型分布饼图 + 费用估算

---

## 发布规范 Checklist (正式发布前必读)
> **版本号规范**: Semantic Versioning (`MAJOR.MINOR.PATCH`)
> - 当前: `0.4.4` -> 下个功能版本 `0.5.0`，修 bug `0.4.5`，正式版 `1.0.0`

| 步骤 | 说明 |
|---|---|
| 1. 更新 `package.json` version | 唯一真相源，代码和检查更新都从这里读 |
| 2. 更新 `Cargo.toml` version | Tauri 也需要同步 |
| 3. 更新 SettingsTab 显示版本 | `当前版本 vX.X.X` 硬编码处 |
| 4. Git tag 用 semver | `git tag v0.4.0`，非 `v2-stageXX-complete` |
| 5. 在 GitHub 创建 Release | 不只是 tag，Release 才会被 `/releases/latest` API 识别 |
| 6. Release 附带安装包 | `.msi` / `.dmg` / `.AppImage` 等 |

> **注意**: 开发阶段的 `v2-stageXX-complete` tag 仅供内部追踪，不影响版本检查。
> 客户端检查更新时只认 semver 格式的 `tag_name` (`/^v?\d+\.\d+\.\d+$/`)。
---

## Phase 6: 企业级分发
- [ ] Sentry 错误上报 (opt-in)
- [ ] Windows 代码签名 (EV 证书)
- [ ] macOS 公证 (notarization)
- [ ] 应用内自动更新
- [ ] 企业代理服务器支持
## 自动化测试
- [x] Rust 单元测试
- [x] CI 集成
- [ ] 前端组件测试 (Vitest)
- [ ] E2E 测试: 安装->配置->启动->对话
## 开源项目规范
- [x] LICENSE / CONTRIBUTING / CHANGELOG / SECURITY / CODE_OF_CONDUCT
- [x] GitHub Issue + PR 模板
- [ ] GitHub Discussions
- [ ] CI 自动生成 Release Notes
## Phase 5.12: 聊天工作区全套 UI 克隆迁移
- [ ] 在 `workspace-clone` 的 `聊天` 菜单内补齐 DragonClaw 聊天工作区全套界面骨架，保留纯前端假交互，不迁移真实功能
## Phase 5.13: 按截图优化聊天工作区界面
- [ ] 默认首页 `workspace-clone` 的 `聊天` 工作区按截图收敛为轻量三栏布局，并补齐右侧 Agent 详情抽屉；其他菜单与 legacy 页面保持保留
- [ ] 首页聊天输入区移除顶部“发送给…”提示和工具栏上方分隔线，进一步贴近目标截图

## Phase 5.14: 引导页浅色高保真改版
- [ ] 引导流按参考图统一为浅色高保真设计，保留现有进度、错误弹窗、工作区选择与确认交互
## Phase 5.15: 首页聊天接入内置 OpenClaw
- [x] 在 `workspace-clone` 首页外壳内接入真实 OpenClaw 网关聊天，首页静默启动服务并把“数字员工”切为真实 Agent 会话入口
- [x] Phase 5.15.1: 修复首页聊天 `gateway token mismatch`，统一从 `~/.openclaw/openclaw.json` 动态读取 `gateway.auth.token`，并同步首页/legacy 控制台入口
- [x] Phase 5.15.2: 修复 `workspace-clone` 首页乱码，并恢复聊天消息区域滚动
- [x] Phase 5.15.2: 收窄首页左侧主菜单栏，并压缩聊天顶部高度与分割线视觉重量
- [x] Phase 5.15.2: 按参考图收敛首页左侧侧边栏的菜单排布、品牌水印与底部操作区
- [x] Phase 5.15.2: 修复首页主侧栏与目录栏的收缩态体验，统一双边栏窄轨宽度、留白与展开入口
- [x] Phase 5.15.2: 恢复首页聊天消息正文的文本选择能力，支持直接框选复制
- [x] Phase 5.15.3: 重构 `workspace-clone` 顶部标题栏与聊天会话头部，并新增应用内仿标题栏
- [x] Phase 5.15.3: 将右侧抽屉升级为会话边栏，迁入模型、记忆、技能库、命令、工具权限主入口
- [x] Phase 5.15.3: 弱化 composer 旧入口并保留 overlay 作为二级详情容器
- [x] Phase 5.15.4: 为 `workspace-clone` 新增独立模型配置弹窗，并接管模型相关点击入口
- [x] Phase 5.15.4: 同步 DragonClaw 模型厂商列表到 workspace 模型弹窗私有数据源
- [x] Phase 5.15.4: 新增 workspace 专用模型配置保存/删除命令并打通 openclaw.json 持久化
- [x] Phase 5.15.5: 为 `workspace-clone` 聊天右侧会话边栏接入 Agent 记忆弹窗，并支持按当前 Agent 读写固定记忆文件
- [x] Phase 5.15.6: 为 `workspace-clone` 聊天右侧边栏接入 Agent 技能库 / 工具权限弹窗，并支持按当前 Agent 读写真实 skills / tools 配置
- [x] Phase 5.15.6: 优化 Agent 资源弹窗高度与滚动，保证技能/工具列表在桌面和中小屏下可完整滚动
- [x] Phase 5.15.7: 将引导推荐技能安装从旧 gateway `skills.search` 链路切换到官方 `curl -fsSL https://skillhub.cn/install/install.sh | bash`，并修复主技能库显示本地已安装技能
- [x] Phase 5.15.8: 统一 `openclaw.json` 真源、补工作区正式契约、修复 Agent 路径安全、onboarding 失败语义与首页控制台 token 扩散

## Phase 5.16: Workspace 频道功能迁移
- [x] 在 `workspace-clone` 首页聊天工作区迁移旧版频道目录、绑定弹窗与 onboarding 体验，保持 legacy tabs 不变
- [x] 在首页频道目录中展示 8 个平台入口，并为微信 / 飞书接入真实绑定链路
- [x] 为 `DragonClaw2` 新增频道专用 Tauri commands、类型与前端 API 封装，保持与旧仓库协议一致
- [x] 让已绑定频道在首页复用对应 Agent 主会话，未绑定频道显示空态引导

## 2026-04-30 Pending Acceptance
- [ ] Phase 5.18: 基于 `docs/design/DESIGN-elevenlabs.md` 建立全局 design token 底座，统一共享样式入口，并将后续 UI 开发约束为优先使用 `src/styles/tokens.css`
- [ ] Phase 5.19: 将 `workspace-clone` 从独立浅蓝 clone 子主题全量迁移到 ElevenLabs 统一 token 与品牌体系，覆盖三栏壳层与相关 drawer / modal / popover / context menu
- [ ] 2026-05-03: 优化 `workspace-clone` 主内容区切换加载骨架为更规整的图 3 风格卡片，且不影响模型配置弹层
- [x] 2026-05-02: update onboarding recommended skill installs to support the `opencli-agent` alias chain and add GitHub-based `html-ppt-skill`.
- [x] 2026-05-02: polish the workspace-clone skills modal so skill card hover/selection is fully visible, remove redundant Installed/Built-in row badges, and align built-in skill rows with the installed list styling.
- [x] 2026-05-02: align the workspace-clone skill detail and install-target popups with the memory modal reference so both use a denser header, panel layout, and less empty space without changing install behavior.
- [x] 2026-05-02: make workspace-clone skill market cards fully clickable like the employees roster cards, and compact the skill detail modal into a smaller single-column narrative layout.
- [x] 2026-05-02: unify the workspace-clone sidebar and directory collapse toggles, pin both to 25% divider height, and reveal them only on divider hover/focus.
- [x] 2026-05-02: reduce the shared custom window titlebar height to 45px and keep narrow-width layouts aligned with the same token source.
- [ ] 2026-05-02: compact the workspace-clone home suggestion cards so the scene card row takes less space above the composer.
- [ ] 2026-05-02: optimize the workspace-clone skill market install-target modal so its header hierarchy, multi-select cards, and footer actions feel denser and clearer without changing install behavior.
- [ ] Phase 5.25: support clickable history session switching in `workspace-clone`, replace raw session-key titles with frontend-derived first-intent summaries, and refine the history drawer to a compact title + time list with `全部 / 今天 / 昨天` filters.
- [ ] Phase 5.25.1: move `workspace-clone` session history caching to a local SQLite store so visited sessions switch instantly, survive app restarts, and refresh in the background without clearing the chat view first.
- [ ] Phase 5.15.13: add inline Markdown / JSON preview for assistant messages in `workspace-clone` chat, with auto-detect + JSON-first fallback and post-stream rendering only.
- [ ] Phase 5.24: add a live process timeline to `workspace-clone` chat, showing thinking, skill/tool calls, command execution, and step completion from existing gateway events without changing backend contracts.
- [ ] Phase 5.24.1: add a transient `思考中` bridge in `workspace-clone` chat so completed tool/command steps are followed by visible processing feedback until the final assistant reply starts streaming.
- [ ] Phase 5.24.2: dedupe mirrored `agent` / `session.tool` live timeline entries in `workspace-clone` chat and upgrade running steps to a lightweight full-row sheen state.
- [ ] 2026-05-02: refine the Phase 5.24.2 running sheen so it feels closer to Codex, with a continuous transparency loop instead of a single obvious light block sweep.
- [ ] 2026-05-02: raise the live sheen visibility further so the animation reads clearly instead of getting washed out by subtle styling or shorthand overrides.
- [ ] 2026-05-02: strengthen the Phase 5.24.2 running sheen again so the motion reads clearly from left to right, closer to Codex's directional live-processing glow.
- [ ] 2026-05-02: correct the running sheen's perceived direction so it clearly reads left-to-right, with a brighter head and a longer trailing glow.
- [ ] 2026-05-02: fix the running sheen's perceived direction by making the asymmetric highlight read unambiguously left-to-right instead of visually reversing.
- [x] Phase 5.17.2: fix startup white-screen by showing an immediate boot splash and lazy-loading ready-page modules/styles without changing startup business logic.
- [ ] Phase 5.22: sync DragonClaw scene cards into `workspace-clone > chat > agents`, including grouped scene cards, case drill-down, composer prefills, per-session open-state persistence, and welcome-state card compaction without changing backend contracts.
- [ ] 2026-05-02: refresh the workspace-clone sidebar footer buttons into a reference-style identity card with a trailing utility action, without changing existing frontend behavior.
- [ ] Phase 5.21: sync DragonClaw skill market into `workspace-clone > skills`, including market browse/search/detail, multi-Agent install targets, and current-Agent skill visibility refresh.
- [x] Phase 5.17.3: replace the blue first-paint boot splash with a compact 200x200 logo loading page, unify the later startup overlay, and tone down onboarding colors to match the ElevenLabs theme tokens.
- [ ] Phase 5.15.10: remove native Windows titlebar and restore custom titlebar window controls permissions/behavior
- [ ] 2026-04-30: remove workspace-clone chat header subtitle text under the avatar.
- [x] 2026-05-02: retire the legacy console shell, remove all frontend `open_console` entry points, and delete the unused Tauri `open_console` command after regression checks.
- [x] 2026-04-30: fix weixin QR binding readiness/response normalization regression so installed/enabled plugins skip blocking revalidation and generated `qr_url` renders in the binding modal.
- [x] 2026-04-30: align workspace-clone weixin QR binding with DragonClaw fallback flow, including CLI login fallback and automatic Agent binding after scan success.
- [x] 2026-05-01: move the workspace-clone sidebar collapse toggle onto the divider edge between the menu rail and directory rail.
- [x] 2026-05-01: center the workspace-clone sidebar edge toggle on the divider and reveal it only on edge hover/focus.
- [x] 2026-05-01: move the workspace-clone primary sidebar menu upward by removing the empty topbar spacing.
- [x] 2026-05-01: align the primary sidebar menu top edge with the directory search box top edge.
- [x] 2026-05-02: remove the translucent DragonClaw logo watermark from the bottom of the workspace-clone sidebar rail.

## Phase 5.20: Workspace 数字员工角色库同步
- [x] 在 `workspace-clone > employees` 同步旧仓库 DragonClaw 的数字员工角色库，补齐分类、搜索、加入、已加入列表与移除卸载，并新增 `install_agency_agent` / `uninstall_agency_agent` / `load_installed_agency_agent_ids` 命令

- [ ] Phase 5.15.12: fix the borderless window maximize display so double-click maximize keeps a safe frame inset and no longer clips the custom titlebar or workspace content on Windows.
## Phase 5.23: OpenClaw CLI PATH 暴露与退出保活
- [ ] 2026-05-02: expose `openclaw` into the current user PATH during setup, keep OpenClaw running when DragonClaw exits from tray quit, and reuse that existing service on the next launch.
## Phase 5.26: 全项目消息提示统一为顶部居中浮层
- [ ] 2026-05-03: add a shared top-center feedback center for result-style prompts and actionable errors, migrate App / setup / workspace-clone notices into it, and retire inline banners, modal status strips, and the legacy bottom repair toast.
## Phase 5.28: 引导安装与启动链路去阻塞化
- [x] 2026-05-03: move setup, service prebuild, and onboarding heavy local work off UI-related command threads so the launcher stays responsive during install and first-run startup.
## Phase 5.30: Homepage Lazy Data Loading
- [ ] Limit ready homepage eager data to chat essentials; lazy load logs, history title backfill, channels, memory, skills, tools, model config, drawers, and modals after user interaction

## Phase 5.31: Homepage Chat Freeze Fix
- [ ] Fix ready homepage chat freezes by guarding gateway reconnect loops, deduplicating initial history loads, lazy-loading markdown rendering, and batching high-frequency log updates.
- [ ] 2026-05-03: remove the highlighted placeholder tool icons plus the `记忆` and `技能库` pills from the `workspace-clone` chat composer without changing command/model/send behavior.

