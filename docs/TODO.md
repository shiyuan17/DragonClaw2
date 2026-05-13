# DragonClaw - 开发任务总表 (AI 开发规范版)

## Phase 5.72: Project-Aware `/spec` and Adaptive `/plan`
- [x] Phase 5.75: keep `workspace-clone` startup focused on the main agent `agent:{id}:main` session while previewing that agent's most recently updated non-main conversation in the chat pane as read-only context, require an explicit user action to continue that history session, improve chat failure attribution for send / model / reconnect errors, and preserve all existing Tauri / Gateway / `invoke()` contracts.
- [ ] 为 `workspace-clone` 新增 `/spec` 与 `/plan` 内置只读 slash commands：`/spec` 面向当前选择的项目目录生成 Spec Kit 风格规格产物，`/plan` 先检测可靠 spec 后自动选择 Spec Kit artifact plan 或 Codex 式只读会话计划，并保持现有 Tauri / Gateway / `invoke()` 契约不变。
- [ ] Phase 5.72.1: 将 `workspace-clone` 内置 slash commands 的用户可见描述文案统一改为中文，覆盖命令管理弹窗与 `/` 联想列表中的 `/spec`、`/plan`、`/kb-*` 项，保持命令值、隐藏 instruction 与现有 `invoke()` / Gateway 契约不变。
- [ ] Phase 5.72.2: 将聊天 composer、旧模型切换弹窗、AI 引擎页模型 chip 与 Provider 新增/保存/删除流程改为仅刷新配置状态，不再自动 stop/start OpenClaw 服务，保持现有 Tauri / Gateway / `invoke()` 契约不变。
- [ ] Phase 5.72.4: 加固 OpenClaw 配置写入安全底座，为 `openclaw.json` 增加备份、候选 JSON 校验、失败恢复、高级 JSON5 / `$include` 防重写保护，并保持现有启动链路、Tauri command 和 `invoke()` 契约不变。

## Phase 5.73: 自动化测试基座与 P0 回归护栏
- [ ] 为 DragonClaw 建立自动化测试基座：补齐前端 `Vitest + jsdom`、统一 Rust 测试包装脚本、PR 级质量工作流，以及 `test:frontend` / `test:rust` / `test:ci` npm 命令，保持现有 Tauri / Gateway / `invoke()` 契约不变。
- [ ] Phase 5.73 P0: 为 `message-normalizers`、`session-cache`、`workspaceChannelBindingShared`、`workspaceCronTaskRunHelpers` 补高风险前端纯逻辑单测，覆盖聊天消息归一化、历史标题回退、缓存过滤、URL 白名单校验和任务运行桥接边界。
- [ ] Phase 5.73 P0: 为 `download.rs`、`setup.rs`、`channels/config.rs` 补高风险 Rust helper 单测，覆盖下载 host allowlist、pinned tag zip 校验、默认模型注入、legacy config 迁移边界、`node_modules` readiness 判断、channel alias / allow-from / legacy account 迁移。
- [ ] Phase 5.73 P1: 扩展到 `skillsMarket.ts`、`workspace-gateway/client.ts`、`live-steps.ts`、`workspaceCloneTaskSchedule*.ts`、`workspaceCloneChatFiles.ts` / `workspaceCloneChatAttachments.ts`，并为 `check:encoding` 增加已知乱码模式自测。
- [ ] Phase 5.73 P1a: 继续为 `workspace-gateway/client.ts`、`live-steps.ts`、`skillsMarket.ts`、`workspaceCloneTaskSchedule*.ts`、`workspaceCloneChatFiles.ts`、`workspaceCloneChatAttachments.ts` 补纯逻辑单测，优先覆盖格式化回退、payload/type guard、Cron 解析与构建、消息附件/文件提取、去重与边界值。
- [ ] Phase 5.73 P2: 引入最小 Playwright smoke，仅覆盖“启动服务 -> 连接 gateway -> 打开聊天”的桌面链路，不做全量视觉回归或完整安装 E2E。

## Phase 5.74: Workspace 聊天输出流程治理
- [x] 治理 `workspace-clone` 聊天输出流程：用户消息显示已使用的 slash command，隐藏工作目录/技能/知识库/命令 instruction 注入块，兼容增量与累计流式 delta，压缩工具/命令 live timeline，并隐藏目录列表、stdout/stderr、raw JSON/HTML 与 process 噪声，不改 Tauri / Gateway / `invoke()` 契约。
- [ ] Phase 5.74.1: 将 `workspace-clone` 聊天回显样式对齐 Codex：用户命令/技能显示为图标 + 文本 tag，Agent 回复去掉外层气泡容器，streaming 阶段启用 Markdown / 富文本预览，并进一步压缩 live timeline，不改 Tauri / Gateway / `invoke()` 契约。
- [ ] Phase 5.74.1a: 统一 `workspace-clone` live timeline 中“执行命令 / 调用工具 / 思考中”等步骤标签与消息 tag 的字号、行高、胶囊高度和状态 badge 尺寸，只改前端渲染层与样式层，不改 Tauri / Gateway / `invoke()` 契约。
- [ ] Phase 5.74.1: 收敛 `workspace-clone` 内置 `/plan` 的用户可见回复，禁止输出 Spec 检测步骤、Spec Kit / Codex-style 模式判定和命令执行逻辑，只保留面向用户的规划结果或必要阻塞说明，不改 Tauri / Gateway / `invoke()` 契约。
- [ ] Phase 5.74.2: 隐藏 `workspace-clone` 主聊天区中的 `(no output)`、shell 错误回显和内部提示文件 raw dump，并将用户消息时间移到气泡容器外部下方，不改 Tauri / Gateway / `invoke()` 契约。
- [ ] Phase 5.74.3: 为 `workspace-clone` live timeline 增加 Codex 式工具操作类型，按真实动作显示“正在编辑 / 已编辑”“正在创建 / 已创建”“正在读取 / 已读取”“正在搜索 / 已搜索”等状态，并保持现有 Gateway / `invoke()` 契约不变。

## Phase 5.71: Workspace 知识库接入 Lake 编辑器
- [ ] 将 `workspace-clone` 左侧 `knowledge` 从占位页升级为真实知识库页面，接入应用级共享知识库配置、多目录本地文件浏览、文本优先的 Lake 预览/编辑能力，并保持现有 Tauri / Gateway / `invoke()` 契约不破坏。
- [ ] Phase 5.71.1: 将知识库页面收敛为“总览态 / 知识库内页”双态布局：总览态左侧为知识库列表、右侧为知识库预览区并提供新建按钮与网格 / 列表切换；新建知识库仅填写名称与简介，自动绑定到 `engine_dir()/knowledge-base/<slug>`；进入知识库后切换为左侧文件目录、右侧 Lake 编辑器，不破坏现有 Tauri / Gateway / `invoke()` 契约。
- [ ] Phase 5.71.2: 将知识库从 workspace 主侧边栏一级入口降级为聊天 / Agent 工作流资源入口，保留现有知识库面板、Lake 编辑和 Tauri command 契约，并新增 `/kb-extract`、`/kb-digest`、`/kb-output`、`/kb-inspect` 内置命令。

## Phase 5.68.2: Workspace Composer 已连接状态入口收敛
- [x] 去掉 `workspace-clone` 聊天 composer 中常驻显示的“会话已连接”状态 pill，仅保留连接中 / 未启动 / 异常 / 生成中等必要状态反馈，限定为前端渲染层微调，不改任何 Tauri / Gateway / `invoke()` 契约。

## Phase 5.68.1: Workspace Composer Pills 文案收敛
- [x] 将 `workspace-clone` composer 的场景 / 邮箱 / 命令 / 工作目录入口收敛为紧凑图标按钮，修复工作目录菜单遮挡；邮箱已绑定态与邮箱绑定弹窗均改为对应 provider 图标语义，模型 pill 去掉“模型”前缀但保留当前模型名称，仅改前端渲染层与样式，不修改任何 Tauri / Gateway / `invoke()` 契约。
- [ ] Phase 5.68.1a: 修复 `workspace-clone` composer 底部模型选择菜单与 slash 联想弹层被输入容器裁切的问题，限定为前端样式热修，不改任何 Tauri / Gateway / `invoke()` 契约。

## Phase 5.15.11b: Workspace Composer 邮箱入口已绑定文案收敛
- [x] 将 `workspace-clone` composer 邮箱入口的已绑定态文案从“邮箱 + 服务商名”收敛为直接显示绑定邮箱账号，仅改前端渲染层，不改任何 Tauri / Gateway / `invoke()` 契约。

## Phase 5.70: Workspace 聊天附件上传对齐 OpenClaw
- [x] 为 `workspace-clone` 聊天输入框补齐真实附件能力，对齐 OpenClaw `chat.send + attachments[]` 契约，支持拖拽/点选多文件上传、紧凑附件卡片展示、纯附件发送，以及用户消息中的图片/文档/代码附件预览，不修改任何 Tauri / Gateway / `invoke()` 契约。
- [x] Phase 5.70.1: 将 `workspace-clone` composer 的附件入口前移到 pills 首位，并收敛为纯图标按钮，不显示“附件”文字，保持现有附件选择/发送链路不变。

## Phase 5.69: Workspace 欢迎态与会话级工作目录选择
- [x] 将 `workspace-clone` 新建聊天空态改为 logo + `DragonClaw,让Ai更简单` hero，并为欢迎态与 composer 共用一套会话级“选择工作目录”入口，通过前端隐藏上下文注入工作目录而不改任何 Tauri / Gateway / `invoke()` 契约。
- [x] Phase 5.69.1: 去掉 `workspace-clone` 欢迎态 hero 外层容器框，并让 logo / 文案 / 工作目录入口在聊天内容区域内垂直居中，限定为前端布局与样式微调，不改任何 Tauri / Gateway / `invoke()` 契约。
- [ ] Phase 5.69.2: 让 `workspace-clone` composer 在已选择项目目录后显示目录名称，未选择时仍保留紧凑图标入口，不改任何 Tauri / Gateway / `invoke()` 契约。
- [ ] Phase 5.69.3: 将 `workspace-clone` 项目目录选择从会话级内存态改为按 Agent 共享默认值；同一 Agent 下新对话继承最新项目目录，旧会话也显示该 Agent 当前默认目录，并使用前端本地存储跨重启持久化，保持现有 Tauri / Gateway / `invoke()` 契约不变。

## Phase 5.68: Workspace Composer Action Icon Refresh
- [ ] 将 `workspace-clone` 聊天 composer 的 `新对话` 入口改为更明确的图标操作，并把发送按钮替换为更符合发送语义的标准图标，限定为前端渲染层与样式微调，不改任何 Tauri / Gateway / `invoke()` 契约。
- [x] 收敛 composer 已选命令/技能 tag 的移除交互：默认不显示单独关闭图标，鼠标 hover 时将前置图标切换为关闭图标，并保持现有清除行为不变。

## Phase 5.55.1: Gateway RPC Readiness Grace
- [ ] Prevent false OpenClaw startup failure while gateway sidecars are warming up by separating true `gateway ready` log detection from HTTP listening, widening RPC probe timeouts, and preserving persistent-service reuse without changing Tauri command or `invoke()` contracts.

## Phase 5.55.2: Startup 单实例自愈与卡死修复
- [ ] 修复启动偶发卡在 `正在检查环境 / launching` 的问题，将生命周期快照改为非阻塞读取，在启动前收敛 launcher-owned OpenClaw 残留进程，补齐 `service-starting` 轮询/超时兜底，并保持现有 Tauri command / `invoke()` 契约与后台常驻策略不变。

## Phase 5.55.3: 启动 RPC 探测超时竞态热修
- [ ] 修复 `wait_for_service_ready()` 在总启动超时边界内被最后一次阻塞 RPC probe 误导为失败的问题：单次 probe timeout 不得超过剩余启动预算，probe 返回后和最终 timeout 分支前都要再次确认 authoritative `gateway ready` 日志 + 端口监听真相，并在“probe 期间晚到 ready”时保留诊断日志且不改任何 Tauri command / `invoke()` 契约。

## Phase 5.56: Workspace Task Card and Editor Refresh
- [ ] Rebuild the `workspace-clone` task drawer cards and task editor modal into the new compact layout, remove the inline recent-runs block, keep task titles human-readable via one shared display-title resolver, preserve manual `enabled / disabled` filter selection, correct the task dropdown menu styling, show concrete trigger timing for task loops, add a running-only animated indicator in the list without affecting the title line, bridge manual `Run now` with an optimistic running state until real run signals arrive, pass accepted `cron.run` `runId` values into the existing live timeline state, and make manual `Run now` open an independent frontend task-run conversation that first shows a system `正在执行中` reply, then attaches to the real OpenClaw result session or a terminal no-session fallback without changing real cron / Gateway / `invoke()` contracts.

- [ ] Phase 5.56.3: realign manual `Run now` with official OpenClaw task semantics by avoiding pre-opened synthetic task chats, switching into real sessions only when upstream produces one, forcing immediate wake for `main + systemEvent` manual runs, removing the extra visible `模式` UI, and restoring legacy synthetic task sessions by binding them to real gateway sessions before send/reset/new-chat actions continue.
- [ ] Phase 5.56.4: restore local Rust/Tauri testability first, reproduce one real task run from the current list, then make manual `Run now` bridge directly into real target sessions by `sessionTarget + job.sessionKey`, initialize live-run state immediately from accepted `runId`, and keep `cron.runs` only as a fallback closeout/binding path without changing Tauri or Gateway contracts.
- [ ] Phase 5.56.5: replace manual task `Run now` with a chat-first new-session flow that creates a real gateway session for the task agent, inserts a local `正在执行任务` system hint, sends the task payload as a user message, and aligns homepage `新对话` with true `sessions.create` behavior instead of `sessions.reset`.
- [ ] Phase 5.56.6a: de-duplicate chat-first manual task execution content, strip schedule/time wording from manual-run hints and visible user messages, and inject a hidden guardrail prompt so running an existing task does not create or mutate task records unless the user explicitly asks for task management in-chat.
- [ ] Phase 5.56.7: show an immediate `执行中` toast when the user clicks manual task `Run now`, then continue the existing chat-first execution flow without changing any Tauri / Gateway / `invoke()` contracts.
- [ ] Phase 5.56.6: allow clicking blank space in the `workspace-clone` chat canvas to close the right utility drawer, while keeping message cards, composer controls, task actions, and all existing `invoke()` / session handlers unchanged.

## Phase 5.57: Workspace 运行日志分类与详情优化
- [ ] Upgrade the `workspace-clone` runtime log drawer into categorized, compact log cards with `全部 / 工具调用 / 技能调用 / 系统事件 / 其他` filters, inferred OpenClaw raw-type labels, and a readable detail modal, while keeping the existing `LogEntry` source plus all Tauri / `invoke()` contracts unchanged.
- [ ] Phase 5.57.1: fix the `workspace-clone` runtime log drawer so log cards render visible title/summary text again, the log filter row stays readable at drawer width, and the right drawer no longer feels visually clipped, without changing any Tauri / `invoke()` contracts.

## Phase 5.58: Workspace 历史会话标题恢复
- [ ] Restore missing `workspace-clone` history session titles so each history card shows a human-readable conversation title instead of only time, repair empty SQLite cache titles from cached messages, immediately sync a new real session title from the first visible user message before `chat.final`, keep history-drawer title display in sync with the agent secondary list, and preserve existing Tauri / Gateway / `invoke()` contracts.

## Phase 5.58: Workspace 聊天文件侧栏
- [ ] Add a `文件` entry to the `workspace-clone` chat more-menu, open a right-side file drawer for the current session, extract user and assistant file or link targets from chat messages, support `全部 / 网站 / 文档 / excel / ppt / 图片 / 视频 / 音频` filters, and open targets directly without changing existing Tauri commands, Gateway contracts, or `invoke()` signatures.
- [ ] Phase 5.58.1: repair the `workspace-clone` chat file drawer so the right-side panel hands height correctly to the file list, keeps the filter row visible, and restores independent vertical scrolling without changing any Tauri / Gateway / `invoke()` contracts.
- [ ] Phase 5.58.2: fix the `workspace-clone` session menu drawer so the right-side panel stretches to the full workspace height and the lower section is no longer clipped by the drawer shell.

## Phase 5.59: Workspace 侧边栏产品落地项开放
- [ ] Open the `workspace-clone` sidebar `产品落地` item as a first-class menu entry, remove its muted placeholder styling, correct the touched sidebar copy, and replace the generic compact placeholder with a dedicated frontend-only product landing view without changing any Tauri / Gateway / `invoke()` contracts.
- [ ] Phase 5.59.1: polish the `workspace-clone` `产品落地` page by syncing the remaining DragonClaw product delivery items, upgrading it into a hero + card-matrix + guidance layout, and keeping all Tauri / Gateway / `invoke()` contracts unchanged.

## Phase 5.58y: Windows 运行态 Logo 修复
- [ ] 修复 Windows 运行态窗口/任务栏/托盘/安装产物图标一致性，统一主窗口与托盘共享 `src-tauri/icons/icon.ico` 对应的默认图标来源，并保持现有 Tauri command / `invoke()` 契约不变。

## Phase 5.58.x: Workspace 日志与历史会话错码热修
- [ ] Repair `workspace-clone` runtime log cards and history session titles by restoring UTF-8 humanized log strings, filtering suspicious mojibake titles from frontend caches, self-healing cached session titles from stored messages, and keeping final non-empty drawer-visible fallbacks without changing any Tauri / Gateway / `invoke()` contracts.

## Phase 5.61: PostHog 基础产品监控接入
- [ ] Integrate baseline PostHog product analytics into the real `workspace-clone` frontend flow with manual events only, default-enabled local opt-out, a lightweight workspace settings toggle, and no Tauri / Gateway / `invoke()` contract changes.

## Phase 5.62: Windows 无 bash 的 SkillHub 技能安装兜底
- [ ] 修复 Windows 无 `bash` 时 SkillHub 技能安装失败的问题，为 onboarding 推荐技能和 `workspace-clone` 技能市场统一增加基于 Python 的原生 fallback，保持现有 Tauri command / `invoke()` 契约不变，并在运行时不可用时返回明确前置条件提示。

## Phase 5.63: 全仓乱码文案排查与编码门禁补强
- [ ] 修复 `workspace-clone` 与 onboarding 已确认的高曝光乱码文案，并补强 `check:encoding` 门禁以拦截同类 mojibake 字符串继续进入仓库，不改任何 Tauri command / `invoke()` 契约。

## Phase 5.64: Workspace 模型配置卡片回刷与显示名本地化
- [ ] 修复 `workspace-clone` 模型配置弹窗中新建配置后顶部卡片不立即回刷的问题，并将 provider `displayName` 从 `openclaw.json` 迁出到 DragonClaw 本地状态持久化，保持现有 Tauri command / `invoke()` 契约与 OpenClaw provider JSON 支持字段不变。

## Phase 5.65: Workspace 模型配置异步保存与卡片换行修复
- [ ] 将 `workspace-clone` 模型配置弹窗的新建/编辑保存链路改为前端立即插卡、后端异步写入 `openclaw.json` / `agents/main/agent/models.json`，保持“保存配置不切换模型”的边界，并修复顶部卡片超过 3 条后的换行与 footer 挤出布局问题。
- [ ] Phase 5.65.1: 将 `workspace-clone` 模型配置中的协议下拉从笼统的“OpenAI 兼容”拆分为 `OpenAI Completion`、`OpenAI Responses`、`Anthropic Messages` 三种显式协议值，保持现有保存命令、`invoke()` 参数形状与已存配置兼容。

## Phase 5.66: Workspace 聊天动画与渲染性能优化
- [ ] 优化 `workspace-clone` 聊天区的滚动、live timeline、drawer / modal 首开体验与高频动效成本：流式更新默认使用非平滑自动跟底、精简运行态动画、取消 Markdown 首次懒加载闪烁、预取聊天侧 drawer / 模型弹窗、收口聊天相关 overlay blur，并补齐 `prefers-reduced-motion`，保持现有 Tauri / Gateway / `invoke()` 契约不变。

## Phase 5.67: Workspace 技能库弹窗缓存
- [ ] 为 `workspace-clone` 当前 Agent 的技能库弹窗增加前端快照缓存与静默回刷：首次打开仍走真实加载，重复打开优先复用最近一次技能列表与勾选快照，仅在缓存缺失或过期时再后台刷新，避免每次打开都进入等待态，且不改任何 Tauri / Gateway / `invoke()` 契约。

## Phase 5.55: Startup Flow Single Source and Persistent Service
- [ ] Unify startup into the React guide/setup surface, remove the static Booting splash and duplicate OpenClaw startup overlay, keep homepage chat from replaying the normal startup checklist, and leave OpenClaw running across DragonClaw quits for fast reuse without changing Tauri command or `invoke()` contracts.

## Phase 5.54: 内置 OpenClaw 升级到 v2026.5.4
- [ ] 将 DragonClaw 内置 OpenClaw 锁定版本从 `v2026.4.27` 升级到 `v2026.5.4`，保持 `.openclaw_version` 自动重装、`pnpm install` + 条件 `pnpm build` 安装链路，以及本地 gateway / Control UI / 首页聊天回归可用，不改任何 Tauri command 签名或前端 `invoke()` 契约。

## Phase 5.53: Workspace 任务抽屉样式收敛
- [x] 收敛 `workspace-clone` 右侧任务抽屉的列表样式与操作入口，改为紧凑任务行、轻量运行 footer 与更多菜单，不扩展任务创建能力，也不改动现有真实 cron / `invoke()` 契约。

## Phase 5.52: Workspace 真实任务管理接入
- [ ] 将 `workspace-clone` 右侧任务抽屉切换到真实 OpenClaw `cron` 数据，支持真实列表、编辑、启停、删除、立即运行和最近运行结果展示，不新增任务创建入口，也不改动现有 Tauri command / `invoke()` 契约。
- [ ] Phase 5.52 扩展：将左侧栏 `任务`（`schedule`）从占位页切到真实定时任务管理页，复用现有 cron 列表与操作，保留 chat 里的右侧任务抽屉，不新增创建流程，也不改动 Tauri / Gateway / `invoke()` 契约。
## Phase 5.42a: Security Hotfix
- [ ] 修复邮箱绑定 `.env` 注入、gateway token 暴露边界、敏感凭据落盘与安装/插件完整性校验问题，不改现有 Tauri command 签名或 `invoke()` 契约。

- [ ] 本轮按保守热修执行：只修 `workspace-clone` cron 空 agent 误绑、模型切换 busy 卡死、`--dc-workspace-accent-border` 缺失；Control UI `#token=` 与聊天缓存明文落盘改为下一阶段专项，不在本轮直接改动高风险链路。
## Phase 5.43: Startup Truth Source and Encoding Cleanup
- [ ] 统一服务生命周期真源，移除前端 optimistic ready / 日志文案 ready 判定，并修复启动、设置、聊天、绑定与服务提示中的高曝光乱码文本。

## Phase 5.44: Config Repository Completion
- [ ] 将 `openclaw.json` 写入口继续收口到 `ConfigRepository`，修复 `save_api_config` 双写与吞错问题，保持 JSON shape 与现有契约不变。

## Phase 5.45: Workspace Clone Consolidation
- [ ] 继续拆分 `workspace-clone` 聊天/渠道编排，修复 `openBindingModal` 陈旧快照判断，并同步落实大文件约束与目录职责边界。

## Phase 5.46: Channel Flow Unification
- [ ] 统一渠道 / 邮箱 / 二维码接入 flow、typed payload 与完成态，保持现有 command 名称、参数和返回 shape 不变。

## Phase 5.47: IA, Test, and Governance Follow-through
- [ ] 收敛占位信息架构，补启动/配置/渠道/聊天关键自动化护栏，并继续下调大文件 baseline 与编码门禁。

## Phase 5.50: workspace-clone 聊天原始工具/命令回显隐藏
- [ ] 为 `workspace-clone` 聊天区隐藏原始工具/命令回显与混入最终答复的工具噪音，保留精简 live timeline 与最终面向用户的正文回答，不修改网关协议或 `invoke()` 契约。
## Phase 5.51: 首页聊天连通失败与网关真相修复
- [ ] 修复首页聊天长期停留在“正在验证网关 / 连接聊天”却始终连不上的问题，统一 ready 真相为 PID 存活 + 端口监听 + RPC/token 校验通过，并在 stale runtime state 或浏览器侧握手失败时返回真实失败态而不是假复用。
## Phase 5.41: State and Config Consolidation
- [ ] 收口 `openclaw.json` 写入口、服务生命周期结构化真源与 Control UI 预构建路径，不改变既有 Tauri command 签名或前端 `invoke()` 协议。

## Phase 5.41: Startup Source Mojibake Cleanup and Encoding Guard
- [ ] 修复 `channels` 后端与 `workspace-clone` 前端中真实存储的错码字符串/坏标点，恢复启动可编译状态，并增加 UTF-8 乱码防回归检查脚本。

## Phase 5.42: Workspace Command Modal Simplification and Editor Refresh
- [ ] 简化 `workspace-clone` 命令弹窗为单列表结构，并将新增/编辑命令改为参考图样式的独立居中表单弹窗，保持现有 slash command 行为与 `invoke()` 契约不变。
- [x] 收敛命令编辑弹窗字段：将“命令值”改为可编辑输入，移除底部独立“说明 / 命令指令”区块，并补足 footer 按钮与分割线之间的留白，不改任何 `invoke()` 或后端命令契约。
- [x] 删除新建命令弹窗里“命令值”输入框下方的冗余预览条，仅保留单个可编辑输入，不改任何 slash command 保存契约。
- [x] 将 `workspace-clone` 命令弹窗标题改为全中文文案，并优化命令列表中“系统 / 自定义”类型 tag 的位置、层级与胶囊样式，限定为前端渲染层与样式层调整，不改任何 `invoke()`、事件处理或后端契约。

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

## Phase 5.20.2: 数字员工最近会话二级菜单收敛
- [ ] 将 `workspace-clone` 聊天目录中的数字员工最近会话改为默认显示 3 条、超过 3 条显示“展开更多”、展开后最多展示 7 条并支持“收起更多”，保持现有 session 切换语义与 `invoke()` 契约不变

## Phase 5.15.9: 首页收缩侧边栏视觉重设计
- [x] `workspace-clone` 首页收缩态侧边栏改为参考图风格的双轨轻量导航，统一左侧菜单轨与右侧迷你目录轨的卡片节奏、间距、阴影和选中态

## Phase 5.15.11: `workspace-clone` 全域悬浮高亮统一
- [ ] 为 `workspace-clone` 左侧菜单、第二栏、主区头部、drawer、composer、popover 与专属弹层统一可用态 hover / focus-visible 高亮反馈，并保持 `active > hover > default`、`muted/disabled` 语义不变
- [ ] Phase 5.15.11a: remove the misleading persistent active highlight from the `workspace-clone` composer email pill so a bound mailbox still reads as available metadata, not as the currently selected composer mode.

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
- [ ] 2026-05-05: change the `workspace-clone` composer model pill to open a flat saved-model list first, and only open the model config modal from a dedicated “configure custom model” action.
- [ ] 2026-05-02: optimize the workspace-clone skill market install-target modal so its header hierarchy, multi-select cards, and footer actions feel denser and clearer without changing install behavior.
- [ ] Phase 5.25: support clickable history session switching in `workspace-clone`, replace raw session-key titles with frontend-derived first-intent summaries, and refine the history drawer to a compact title + time list with `全部 / 今天 / 昨天` filters.
- [ ] Phase 5.25.1: move `workspace-clone` session history caching to a local SQLite store so visited sessions switch instantly, survive app restarts, and refresh in the background without clearing the chat view first.
- [ ] Phase 5.15.13: add inline Markdown / JSON preview for assistant messages in `workspace-clone` chat, with auto-detect + JSON-first fallback and post-stream rendering only.
- [ ] Phase 5.24: add a live process timeline to `workspace-clone` chat, showing thinking, skill/tool calls, command execution, and step completion from existing gateway events without changing backend contracts.
- [ ] Phase 5.24.1: add a transient `思考中` bridge in `workspace-clone` chat so completed tool/command steps are followed by visible processing feedback until the final assistant reply starts streaming.
- [ ] Phase 5.24.2: dedupe mirrored `agent` / `session.tool` live timeline entries in `workspace-clone` chat and upgrade running steps to a lightweight full-row sheen state.
- [ ] Phase 5.24.3: fix duplicate tool-call cards in `workspace-clone` chat by tightening frontend live-step dedupe semantics and guarding stale connection callbacks without changing gateway or `invoke()` contracts.
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

- [ ] Phase 5.20.1: fix `workspace-clone > employees` install/remove roster refresh so chat agent directory, channel-binding agent picker, and local cached/offline roster stay in sync without changing Tauri command signatures or frontend `invoke()` contracts.

- [ ] Phase 5.20.2: add a recent-3-session nested list to the `workspace-clone > chat` employee directory, add an expand/collapse affordance on the right side, and default cards with more than one session to expanded without changing Gateway/session/`invoke()` contracts.

## Phase 5.31: Homepage Chat Freeze Fix
- [ ] Fix ready homepage chat freezes by guarding gateway reconnect loops, deduplicating initial history loads, lazy-loading markdown rendering, and batching high-frequency log updates.
- [ ] 2026-05-03: remove the highlighted placeholder tool icons plus the `记忆` and `技能库` pills from the `workspace-clone` chat composer without changing command/model/send behavior.
## Phase 5.43b: `workspace-clone` 头像调整功能迁移
- [ ] 将旧仓库头像调整能力迁移到 `workspace-clone > chat > agents`，支持预设头像、自定义上传、恢复默认，并使用前端本地存储持久化覆盖结果且不改动任何 Tauri command / `invoke()` 契约。
## Phase 5.48: Workspace 头像弹窗修复与默认头像分配
- [ ] 修复 `workspace-clone` 聊天回复头像拉伸裁切、头像弹窗显示不全与英文文案残留，并为新加入的数字员工在无自带头像时按 `agentId` 稳定分配默认插画头像，不改任何 Tauri command / `invoke()` 契约。

## Phase 5.72.3: Tauri 启动时的 Cargo PATH 自举
- [ ] 修复 `npm run tauri dev` 在 Windows 上因 `cargo metadata` 找不到 `cargo` 而启动失败的问题；为 Tauri CLI 增加仅当前进程生效的 Cargo PATH 补全与更明确的缺失提示。
