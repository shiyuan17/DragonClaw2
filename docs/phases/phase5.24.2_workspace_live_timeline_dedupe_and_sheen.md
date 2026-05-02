# Phase 5.24.2: workspace-clone live timeline 去重与流光进行态

> 状态：规划中 / 待实现
> 类型：前端聊天体验优化

## 目标

在不修改任何后端协议、Tauri `invoke()` 契约、历史消息结构或工具事件协议的前提下，修复 `workspace-clone` 首页聊天 live timeline 中同一工具步骤成对显示的问题，并将当前 `running` 状态从单纯脉冲升级为更明显但仍克制的整行流光进行态。

本期关注两个用户感知问题：

- 同一工具步骤在 UI 中被重复显示，造成“像是调用了两次”的误解
- 进行中的时间线视觉反馈偏弱，不够像真实处理中

## 范围

- 仅修改前端 `workspace-clone` 聊天时间线的数据归并与样式层
- 保留同时监听 `agent` 与 `session.tool` 两类 gateway 事件
- 仅折叠跨事件源镜像重复，不隐藏同一事件源内真实发生的连续重复调用
- 对 `running` 的 live step 增加整行轻量流光效果，并保留弱化后的现有 pulse 节奏
- 如需新增视觉语义，只在 `src/styles/tokens.css` 增加最小必要的 `--dc-workspace-live-*` token

## 不包含

- 不修改 Rust / Tauri 命令
- 不修改 OpenClaw gateway 协议或事件结构
- 不新增独立消息气泡、第二套过程面板或历史消息持久化字段
- 不将 dedupe 来源信息暴露到公共 TypeScript 类型
- 不移除 `agent` 或 `session.tool` 任一路事件订阅

## 实现约束

### 工具步骤去重

- 在 live step 写入前增加前端本地去重层
- 去重键按当前 run 维度归一：
  - 优先稳定标识：`itemId` / `toolCallId` / `tool_call_id` / `id`
  - 若缺失稳定标识，则回退为 `kind + title + detail + status + sessionKey/runId`
- 仅在“跨事件源、同 run、同签名、时间差 <= 1500ms”的场景折叠为同一步骤
- 如果稳定标识相同，直接视为同一步骤更新
- dedupe 仅影响新增/镜像重复阶段，不影响现有 status 更新、thinking bridge、final 清理和 abort 清理
- 需要为当前 run 维护仅内存态的 dedupe 缓存，并在 run 结束、reset、disconnect、session 切换、agent 切换时清空

### 进行中流光

- `running` step 改为整行轻量扫光，限制在卡片圆角内
- 流光通过伪元素实现，不影响布局与交互，需 `pointer-events: none`
- 主视觉由横向流光承担，图标与状态点保留但弱化 pulse
- `success` / `error` / `aborted` 不保留流光，仍以静态收口样式表达完成态

## 验收标准

- 原先成对显示的 `web_search` / `web_fetch` 只保留一组步骤
- 同一事件源内真实连续重复调用不会被误合并
- `思考中 -> 工具/命令 -> 思考中 -> 最终回复` 现有链路保持成立
- running 步骤出现整行横向流光，完成/失败后流光停止
- `npm run build` 通过

## 手动验证

1. 发送一个触发工具调用的请求，确认原先重复的工具步骤被折叠为一组
2. 发送一个真实连续两次相同工具调用的请求，确认不会因为同名而误合并
3. 验证工具结束后到最终回复前的 `思考中` bridge 仍正常出现与清理
4. 验证 running 步骤出现横向流光，success / error / aborted 收口后流光停止
5. 在运行中执行 abort、reset、切换 Agent、切换 session、断连，确认不残留重复步骤、去重缓存或流光状态

## 2026-05-02 Follow-up

- 将 running 行的流光从“单块扫过”继续调整为更接近 Codex 的持续活跃态
- 主体改为整行透明高光循环与轻微流动，而不是单独一块亮片横扫
- 保留轻度移动感，但把主要存在感交给整行透明度节奏与持续发光氛围

## 2026-05-02 Visibility Fix

- 继续提高流光层可见度，避免被 `background` 简写或过弱透明度冲淡
- 优先让整行高光层更明确地出现在卡片内部，而不是只剩很轻的漂移感
- 保留持续透明度循环，但把视觉中心放到更容易看见的柔光层与边缘提亮上
