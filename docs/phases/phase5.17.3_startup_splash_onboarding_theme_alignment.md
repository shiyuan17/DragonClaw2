# Phase 5.17.3: 启动占位页收敛与引导页主题对齐

> 状态: Planned
> 日期: 2026-05-02

## 背景

Phase 5.17.2 已解决冷启动白屏问题，通过 `index.html` 的 `boot-splash` 让窗口首帧立即可见；Phase 5.14 则为 `SetupWizard` 制定了浅色高保真引导页方案。但当前两者仍存在两个明显问题：

- 首屏 `boot-splash` 仍沿用偏蓝、偏占位页的独立视觉，与当前 ElevenLabs 主题不一致。
- React 内的 `StartupOverlay` 和 `SetupWizard` 仍保留较强的彩色雾面氛围，和现有 token 化主题相比显得过于花哨。

这次调整作为一个纯前端 UI 跟进任务，目标不是改启动流程，而是把启动链路上的视觉语言统一为更克制、更主题化的品牌表达。

## 目标

- 将冷启动首屏 `boot-splash` 改为以现有 logo 为核心的 200x200 loading 页。
- 将服务启动中的 `StartupOverlay` 与首屏 `boot-splash` 收敛到同一套简洁视觉语言。
- 将 `SetupWizard` 从偏彩色云雾的引导页，收敛为更贴近 ElevenLabs 主题的极简浅色 editorial 风格。
- 保持所有启动、初始化、工作区选择、重试与错误处理逻辑不变。

## 约束

- 仅修改 `index.html`、`.tsx`、`.css` 与 token 层，不改 Rust、hooks、`invoke()` 调用或任何 command 签名。
- `dismissBootSplash()` 的挂载点、退出 class 和移除时机保持兼容，不重写首屏移除逻辑。
- 新视觉变量优先进入 `src/styles/tokens.css`，组件样式只消费 token，不新增脱离主题系统的硬编码品牌值。

## 实施方案

### 1. 首屏 `boot-splash`

- 去掉蓝色 badge、大标题卡片和偏蓝渐变氛围。
- 保留 `#boot-splash` 容器与 `is-leaving` 退场协议。
- 使用现有 `dragonclaw-logo.png` 作为视觉核心，构建 200x200 的 logo stage。
- loading 反馈收敛为低存在感的细进度条或轻量脉冲，不让文案和色彩喧宾夺主。

### 2. `StartupOverlay`

- 保持 `show` prop、显示时机与退场动画机制不变。
- 视觉上对齐首屏占位页：logo 优先、loading 次之、状态文案弱化。
- 继续展示现有状态文案与提示文案，但在层级上退后，避免变成第二套独立封面。

### 3. `SetupWizard`

- 保持 `checking`、`initializing`、`launching`、`workspace` 四阶段结构不变。
- 弱化当前 sky / lavender / rose 的大面积存在感，改为更轻的米白底与极淡 pastel atmosphere。
- 保留进度条、错误 Modal、工作区路径区与按钮交互，但统一收敛到更低饱和、更少颜色的主题表达。
- 如需微调 JSX，仅限于更好支撑视觉层次，不触碰任何 handler 内部逻辑。

## 验收

- 冷启动窗口出现后立即显示新的紧凑 logo loading 页，不再出现蓝色占位页。
- `boot-splash` 退场平滑，React 挂载后无白闪、无残留遮罩。
- 服务启动中的 `StartupOverlay` 与首屏占位页风格一致，且显示/隐藏时机不变。
- `SetupWizard` 四阶段保留现有交互能力，但配色与氛围明显更贴近 ElevenLabs 主题。
- `npm run tauri dev` 可完成前端编译，并支持后续手动执行“启动服务 -> 打开网关 -> 聊天正常”回归。
