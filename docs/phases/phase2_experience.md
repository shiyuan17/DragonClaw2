# Phase 2: "Aha Moment" — 开箱即用体验

> **目标：** 用户安装后 30 秒内能与 AI 对话，无需手动配置任何东西。

## P0: 配置自动注入

### 自动生成 `openclaw.json`
- 首次启动时检测 OpenClaw 目录下是否有 `openclaw.json`
- 不存在则自动生成默认配置（工作区路径指向用户文档目录）
- Rust 侧实现：`openclaw.rs` 新增 `inject_config()` 函数

### 自动生成 `models.json`
- 注入预置的免费 API Key（用于体验层，有额度限制）
- 默认模型设为可用的免费模型
- 用户后续可通过 UI 覆盖

### 实现要点
- 配置注入仅在文件不存在时执行（**非破坏性**）
- 如果用户已有自定义配置，保留不动
- 注入发生在 `npm install` 完成后、服务启动前

## P1: 工作区向导

### 首次启动向导
- 检测是否首次使用（sandbox 中无 `workspace_configured` 标记文件）
- 弹出简洁的文件夹选择对话框
- 默认推荐 `~/Documents/OpenClaw-Projects`
- 选择后将路径写入 `openclaw.json` 的 workspace 字段

### 实现要点
- Tauri 提供原生文件夹选择对话框 API
- 选择后创建 `workspace_configured` 标记文件，后续不再弹窗

## P1: 启动后自动打开浏览器

- 服务启动成功后检测 stdout 中的 "listening" 关键词
- 检测到后延迟 2 秒自动调用 `tauri-plugin-opener` 打开 `http://localhost:3000`
- 仅在手动点击「启动」时触发，自动重启不触发

## P2: UI 升级

### 状态大卡片
- 替换当前纯按钮布局，增加信息展示区
- 显示：运行状态、运行时长、当前模型、工作区路径、端口号
- 卡片带呼吸灯动画（运行中绿色跳动，停止灰色）

### 人话日志过滤
- 在 `service.rs` 增加日志翻译层
- 常见模式映射：`npm WARN` → 忽略 / `listening on` → "✅ 服务就绪"
- 保留"显示原始日志"的切换按钮

## P3: 预置技能包

- 将 `skill-creator` 和 `skill-lookup` 的核心文件复制到 OpenClaw 的 skills 目录
- 在配置注入阶段执行
- 用户首次对话时 AI 就具备"创建技能"和"搜索技能"的能力

## 验收标准

> 在纯净的 Windows/Mac 上安装 v0.2.0 → 双击打开 → 等待初始化 → 浏览器自动弹出 → 直接输入"帮我写一个贪吃蛇" → AI 开始工作。**全程零手动配置。**
