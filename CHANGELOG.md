# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.4.4] - 2026-03-14

### 🐛 Bug 修复

- **Windows node-llama-cpp 兼容性增强** — 扩展 postinstall 失败检测条件，新增 `ERR_DLOPEN_FAILED`（缺少 VC++ 运行时）和 `spawn git ENOENT`（未安装 Git）两种故障模式识别
- **重试策略优化** — 智能重试时同时设置 `NODE_LLAMA_CPP_SKIP_BUILD=true`，彻底跳过源码编译，确保无 Git/CMake 环境也能正常安装

## [0.4.0] - 2026-03-09

### ✨ 新功能

- **自定义模型 ID 输入** — ApiKeyModal 和 ModelSwitchModal 支持手动输入任意模型 ID
- **全局启动覆盖层** — 服务启动时全屏毛玻璃遮罩 + Logo + 进度提示，就绪自动消失
- **品牌 Logo 集成** — 窗口标题栏/任务栏图标替换为品牌 Logo
- **仪表盘脉冲光效** — 运行/停止两种状态的呼吸光效动画增强
- **端口范围扩展** — 自动扫描端口范围从 11 个扩展至 111 个 (18789-18899)

### 🎨 UI 优化

- **启动界面极光动效** — 顶部紫/青极光飘动 + 白色光晕进度条 + 版本号/百分比显示
- **去卡片化重构** — 启动界面移除边框/阴影，纯浮动布局
- **关于页面** — 版本检查 (GitHub API + 旋转动画) + 赞赏二维码
- **日志面板简化** — 一键导出诊断 ZIP 包
- **色彩体系统一** — 全局色彩令牌重置 + Lucide 图标统一
- **Tab 切换优化** — 修复抖动/跳动问题

### 🏗️ 架构重构

- 前端组件拆分 (App.tsx 从 1200+ 行 → ~180 行)
- Custom Hooks 提取 (useSetup / useService / useConfig / useLogs)
- CSS 模块化 (11 个独立样式文件)
- Rust 后端模块拆分 (config.rs / providers.rs / diagnostics.rs)
- Provider 数据外置为 JSON 资源文件

## [0.3.0] - 2026-03-08

### ✨ 新功能 (Phase 3: API Key 配置 + UI 大重构)

- **多提供商 API Key 配置** — 支持 Groq、SiliconFlow、OpenRouter、DeepSeek、OpenAI 等
- **分类浏览** — 免费注册 / Coding Plan / 自定义中转站三个分类
- **模型选择与切换** — 一键切换默认 AI 模型
- **Tab 导航布局** — 仪表盘 / AI 引擎 / 设置中心
- **Premium 深色主题** — 渐变、半透明、微动画
- **自动端口选择** — 18789-18799 端口扫描
- **Gateway Auth Token 自动配置**

## [0.2.5] - 2026-03-07

### 🛡️ 稳定性修复 (Phase 2.5)

- **pnpm 路径探测**: 动态搜索 6 个候选路径，兼容不同 npm 版本
- **端口 3000 检测**: 启动前检查端口占用，友好提示冲突
- **崩溃检测**: 后台心跳监控 + 前端自动恢复 UI 状态
- **npm → pnpm**: 依赖安装改用 pnpm，解决 OpenClaw workspace 兼容问题
- **自动清理**: 检测到旧版 npm 安装的 node_modules 自动重建

### 🐛 Bug 修复

- 修复 Windows `npm.cmd` SyntaxError (改用 `npm-cli.js`)
- 修复 `tsdown not found` (移除 `--omit=dev`, 改用 `run-node.mjs` 启动)
- 修复配置文件格式 (使用 OpenClaw 原生 JSON5 格式)

## [0.2.0] - 2026-03-07

### ✨ 新功能 (Phase 2: "Aha Moment")

- **免费模型预置**: OpenRouter 免费模型 (Gemini Flash, Llama 4, Phi-4, Qwen3)，开箱即聊
- **工作区向导**: 首次启动弹出文件夹选择对话框
- **自动打开浏览器**: 服务就绪后自动打开 `localhost:3000`
- **配置自动注入**: 自动生成 `openclaw.json` (非破坏性)
- **UI 升级**: 状态大卡片 (服务状态、运行时长、访问地址)
- **人话日志**: npm/Node 技术日志翻译为人话 + 原始/人话切换
- **预置技能包**: 内置 `skill-creator` 和 `skill-finder`
- **免费模型提示**: 金色提示条，引导用户配置 API Key

## [0.1.0] - 2026-03-06

### 🎉 首次发布 (Phase 1: MVP)

- 搭建 Tauri + React 基础项目
- 便携式 Node.js 下载与沙盒释放 (AppData 隔离)
- OpenClaw 源码 ZIP 下载 + 智能镜像切换 (GitHub + 2 mirrors)
- `npm install` 自动执行 + 淘宝镜像回退
- 基础控制台 UI (启停服务、日志查看)
- GitHub Actions CI/CD (自动构建 Windows .msi/.nsis, Linux .deb/.rpm)
