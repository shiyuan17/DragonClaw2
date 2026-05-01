# Phase 5.17.1: 微信二维码绑定插件就绪链路修复

> 状态: Completed
> 日期: 2026-04-30

## 背景

`workspace-clone` 频道目录里的微信绑定弹窗可以正常启动，但二维码长期停留在“加载中”，即使状态文案已经进入“二维码已生成”，图片区域仍未拿到可渲染的 `qrUrl`。

排查结果显示，微信 iLink 拉码接口当前可访问，OpenClaw 官方流程要求通过外部插件 `@tencent-weixin/openclaw-weixin` 注册 `openclaw-weixin` channel，并执行 `openclaw channels login --channel openclaw-weixin` 完成扫码登录。DragonClaw 侧的问题集中在两处：

- 当前实现每次启动微信二维码绑定前，都会额外执行 `plugins list` 校验。
- 校验逻辑只把 `openclaw-weixinloaded` 视为成功。
- 当前 OpenClaw CLI 的真实输出状态为 `enabled`，因此会被误判成失败。
- 误判后流程会继续走重装插件和 Gateway 重启，导致二维码获取被阻塞。
- 前端只按 camelCase 读取二维码会话字段；若 Tauri invoke 返回 snake_case 字段（如 `qr_url`），会出现“后端已生成二维码但 UI 仍显示加载中”的假失败。

## 目标

- 插件已安装且已启用时，直接进入二维码获取流程。
- 只有“缺插件”或“刚启用插件”时，才执行安装/启用及必要的 Gateway 重启。
- `plugins list` 检查改为兼容当前 CLI 输出，并降级为非阻断诊断日志。
- 参照旧版 DragonClaw：优先走微信 iLink 直连拉码；如果直连在拿到二维码前失败，则 fallback 到 `openclaw channels login --channel openclaw-weixin` 并解析 CLI 输出里的二维码链接/登录状态。
- 前端兼容 camelCase / snake_case 二维码会话响应，并在轮询状态未重复返回 `qrUrl` 时保留已生成的二维码链接。
- 扫码成功后，如果弹窗内已有可用 Agent 选择，则自动保存微信频道到该 Agent 的绑定；如果没有 Agent，则保留成功状态并提示用户先创建/选择 Agent。

## 实施范围

- 调整 `ensure_weixin_plugin_ready()` 的前置策略。
- 修正 `plugins list` 解析，识别 `enabled` / `loaded` / `disabled` / `failed to load`。
- 为插件状态解析补充单元测试。
- 为微信二维码绑定补齐 CLI fallback：启动 `openclaw channels login --channel openclaw-weixin`，持续读取 stdout/stderr，提取 `http(s)` 二维码链接，并根据成功/失败输出更新会话状态。
- 直连失败但会话已经拿到二维码时，不再覆盖为错误，继续让用户扫码/轮询。
- 调整 `startOpenClawChannelQrBinding()` / `pollOpenClawChannelQrBinding()` 的响应归一化，兼容 `qrUrl` 与 `qr_url`。
- 调整微信二维码轮询状态合并逻辑，避免后续状态快照清空已有二维码。
- 调整 `workspace-clone` 微信弹窗：扫码成功后复用当前选中 Agent 自动保存绑定；没有可用 Agent 时显示明确提示，不丢失扫码结果。

## 验收

- 已安装且已启用插件时，打开绑定弹窗后数秒内能拿到 `qrUrl`。
- 首次安装、启用插件场景下，仍能自动修复并继续走二维码流程。
- iLink 直连在拿到二维码前失败时，会自动回退到官方 CLI 登录流程。
- 扫码成功后，已有 Agent 选择时自动完成频道绑定；无 Agent 时提示用户创建/选择 Agent。
- 飞书绑定链路不受影响。
