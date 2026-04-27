# Phase 5.8: 引导流程静默自动启动

> 状态：待实现

## 目标

在 Launcher 完成环境检查、初始化和工作区配置后，由引导流程自动启动 OpenClaw 服务，并且这次引导启动不自动打开 OpenClaw 浏览器页面。

## 设计原则

- 保留 `DashboardTab` 的按钮布局、文案和交互逻辑，只让它根据 `running/loading` 显示当前状态。
- 不修改现有 `start_service` 命令签名，避免破坏主界面手动启动和托盘行为。
- 新增静默启动入口，仅供引导流程使用。

## 实现方案

1. 前端新增 `launching` 阶段：
   - 环境完整、配置存在但服务未运行时进入 `launching`。
   - 首次安装完成或工作区确认完成后进入 `launching`。
   - `SetupWizard` 在该阶段显示“正在启动引擎”的引导页、错误提示和重试按钮。

2. `useSetup` 编排静默启动：
   - 调用新增的 `start_service_silent`。
   - 监听服务 ready 日志，ready 后设置 `running=true`、`phase=ready`，再执行 `checkApiKey()`。
   - 启动失败时留在引导页，并允许重试。

3. 后端新增静默启动命令：
   - 抽取 `start_service` 内部实现，增加 `open_browser: bool` 控制。
   - `start_service` 继续传入 `true`，保持 ready 后自动打开浏览器。
   - `start_service_silent` 传入 `false`，只启动服务不打开浏览器。

## 验收标准

- 环境和配置已就绪但服务未运行时，打开 Launcher 会自动启动服务，不打开浏览器。
- 首次安装或工作区确认后，会自动启动服务，不打开浏览器。
- 服务 ready 后进入主界面，`DashboardTab` 显示运行中状态。
- 主界面的启动/停止按钮、访问控制台按钮保持原样。
- 主界面手动启动和托盘打开浏览器行为保持原样。
