# Phase 5.61: PostHog 基础产品监控接入

## Summary

- 在当前真实可达的 `workspace-clone` 前端主流程接入 PostHog 基础产品分析，只做手动埋点，不接 Session Replay、异常上报或自动 DOM 行为采集。
- 默认开启、用户可关闭；关闭状态持久化到本地，后续启动继续生效。
- 使用美国区 host 作为默认值：`https://us.i.posthog.com`。
- 不改任何 Tauri command 签名、不改现有 `invoke()` 契约、不改 Gateway 协议。

## Public Inputs / Interfaces

- 新增前端构建时环境变量：
  - `VITE_POSTHOG_KEY`
  - `VITE_POSTHOG_HOST`
- 新增本地偏好键：
  - `localStorage["dragonclaw:telemetry-enabled"]`
  - 语义：缺省视为 `true`；用户关闭后写入 `false`
- 不新增 Rust 接口；本期不做 `identify`，仅使用匿名设备 `distinct_id`。

## Implementation Changes

- 新增统一前端埋点层，作为唯一出口：
  - 负责 `init`、`capture`、`opt in/out`、偏好读取、无 key 时自动 no-op
  - 从环境变量读取 key/host，不把 key 写死到源码
  - 根入口一次性初始化，并关闭自动 pageview / autocapture / replay，只保留手动事件
- 把当前 `workspace-clone` 的“设置文本预览”占位弹层改成真实“工作台设置”弹层：
  - 保留轻量范围，只加一个“数据监控”开关和说明文案
  - 管理员菜单里的“设置”按钮与首页建议卡中的设置入口都指向同一个弹层
  - 不复活旧 `SettingsTab`
- 事件名单固定为首版最小集：
  - `launcher_app_opened`
  - `launcher_ready_workspace_entered`
  - `launcher_workspace_configured`，属性 `source=auto|manual|switch`
  - `launcher_setup_completed`
  - `launcher_setup_failed`，属性 `stage=checking|initializing|launching`
  - `launcher_service_start_requested`
  - `launcher_service_stop_requested`
  - `launcher_service_ready`
  - `launcher_service_failed`
  - `launcher_service_repair_requested`
  - `launcher_environment_reinstall_requested`
  - `launcher_api_config_saved`，属性 `provider`, `has_base_url`, `has_model`
  - `launcher_default_model_changed`
  - `launcher_saved_provider_upserted`
  - `launcher_saved_provider_deleted`
  - `launcher_config_reset_confirmed`
  - `launcher_chat_message_sent`，属性 `surface=workspace_clone`, `session_type=main|agent|task_run`, `agent_id`
  - `launcher_task_run_started`，属性 `trigger=manual`, `agent_id`
- 埋点位置按现有行为边界接入：
  - 启动/初始化相关：`App` 与 `useSetup`
  - 服务启停/修复/重装：`useService`
  - 配置保存/模型切换/重置：`useConfig`
  - 聊天发送与任务运行：`useWorkspaceGatewayChat`、任务运行入口
- 隐私边界固定：
  - 不上传消息正文、Prompt、助手回复、API Key、Gateway Token、Base URL、工作区路径、诊断 ZIP 路径、二维码 URL、原始日志
  - analytics 失败不得影响现有功能，所有 capture 调用都要吞掉错误并保持 UI 正常

## Test Plan

- 无 `VITE_POSTHOG_KEY` 时应用可正常启动，且无埋点相关运行时错误
- 首次启动默认开启，打开应用、启动服务、保存配置、发送聊天、运行任务后，PostHog Live Events 能看到对应事件
- 在工作台设置里关闭后，后续动作不再上报，刷新/重启后仍保持关闭
- 重新开启后，事件恢复上报
- 每个关键动作只记一次，不因为重连、轮询或 live-step 更新产生重复事件
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm run tauri dev`
  - 手动回归：启动服务 -> 打开网关 -> 聊天正常

## Assumptions

- 本期只做“基础埋点”，不做回放、不做异常采集、不做页面级自动分析。
- 配置使用提供的 PostHog project key，但通过 `VITE_POSTHOG_KEY` 注入，不直接写入源码。
- 用户可见开关放在当前 `workspace-clone` 设置弹层中，而不是旧设置页。
- 参考官方接入文档：
  - [PostHog JavaScript docs](https://posthog.com/docs/libraries/js)
  - [PostHog React docs](https://posthog.com/docs/libraries/react)
