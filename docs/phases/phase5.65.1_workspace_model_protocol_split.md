# Phase 5.65.1: Workspace 模型协议显式拆分
> Status: Planned
> Date: 2026-05-11
> Type: Workspace model-config hotfix

## Goal

将 `workspace-clone` 模型配置弹窗里的协议选择从模糊的 “OpenAI 兼容” 收敛为 3 个明确选项：

- `OpenAI Completion`
- `OpenAI Responses`
- `Anthropic Messages`

## Background

当前模型配置弹窗只暴露了两种协议：

- `openai-completions`，但界面文案显示为 “OpenAI 兼容”；
- `anthropic-messages`。

这会把 OpenAI 的 Completion / Responses 两条不同协议链路混在一起，用户无法显式选择 `openai-responses`，也会导致配置含义和真实后端协议不一致。

## Implementation Scope

### 1. 前端协议枚举扩展

- 扩展 `workspace-clone` 侧的协议类型定义，新增 `openai-responses`。
- 保持既有 `openai-completions` 与 `anthropic-messages` 不变，避免破坏已存配置。

### 2. 模型配置弹窗下拉修正

- 将协议下拉改为 3 个明确选项：
  - `OpenAI Completion`
  - `OpenAI Responses`
  - `Anthropic Messages`
- 保持字段仍然写入现有 `api` 参数，不改任何 Tauri command 名称或 payload shape。

### 3. 兼容性边界

- 不改已有 provider preset 的默认协议归属，除非该 preset 本身需要调整。
- 不改 Rust 命令签名，不新增保存链路分支。
- 不重写已存 provider；历史配置继续按原值回显。

## Acceptance Criteria

- 自定义模型配置时，协议下拉可见 3 个明确选项。
- 选择 `OpenAI Responses` 后，保存 payload 中写出的 `api` 值为 `openai-responses`。
- 已保存的 `openai-completions` 与 `anthropic-messages` 配置仍可正常回显和编辑。
- 不影响现有 `invoke()` 契约、provider 保存/删除逻辑与当前模型切换逻辑。

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- Manual regression:
  - 打开 `workspace-clone` 模型配置弹窗并确认协议下拉出现 3 项；
  - 分别保存 `OpenAI Completion` / `OpenAI Responses` / `Anthropic Messages` 自定义配置并确认回显值正确；
  - 确认旧配置重新打开后不会被错误改写。
