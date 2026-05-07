# Phase 5.56.6: Manual Task Execution De-duplication, Time Removal, and Hidden Guardrail Prompt
> Status: Planned
> Date: 2026-05-07
> Type: Frontend behavior change

## Summary

- Keep the current chat-first manual task execution flow instead of returning to `cron.run`.
- Remove duplicated visible task content during manual execution by separating the displayed user message from the transport message sent to the agent.
- Strip schedule/time language from manual execution system hints and visible task messages while leaving real task configuration and history unchanged.
- Inject a hidden guardrail prompt so the agent treats manual execution as "run the existing task now" rather than "create or update another scheduled task".

## Implementation Changes

### 1. Manual run content is split into display and transport layers

- Add a frontend-local helper that converts a `WorkspaceCronJob` into:
  - `displayTitle`
  - `displayMessage`
  - `transportMessage`
- The helper should:
  - derive the raw task body from `agentTurn.message` or `systemEvent.text`
  - remove repeated title/body first-line duplication
  - strip obvious schedule/time phrases from the manual-run title and visible message only
  - fall back to the original meaningful body if cleanup would otherwise leave an empty message

### 2. Chat sending supports hidden prompt injection

- Extend the homepage chat send path so a message may provide:
  - `displayText` for the optimistic local user bubble
  - `transportText` for the actual `chat.send` payload
- Default behavior for normal chat and slash commands must remain unchanged when those fields are omitted.

### 3. Manual run uses the cleaned message plus a hidden guardrail

- `runTaskInNewChat` should accept the split manual-run content instead of a single task string.
- The created real session should render:
  - local system hint: `正在执行任务：{displayTitle}`
  - user bubble: `displayMessage`
- The agent should receive a hidden wrapped prompt that:
  - marks the request as a manual execution of an existing task
  - forbids creating, copying, editing, or deleting task/cron/reminder records unless the user explicitly asks later in the same chat
  - states that the scheduled time should not be restored or reinterpreted because this request means "run now"

### 4. Scope stays limited to the manual execution path

- Do not change task cards, task detail schedule text, or `cron.runs` history semantics.
- Do not add backend enforcement, new Tauri commands, or Gateway RPC changes.
- Do not change ordinary user chat composition outside the manual-run path.

## Public Interfaces / Type Notes

- No Tauri `invoke()` contract changes.
- No Gateway RPC contract changes.
- Frontend-local changes only:
  - `useWorkspaceGatewayChat.sendMessage(...)` adds `displayText` / `transportText`
  - `useWorkspaceManualSessionExecution.runTaskInNewChat(...)` accepts split manual-run content
  - a new manual-run content builder helper is introduced

## Test Plan

- Manual task execution no longer shows duplicated title/body text in the user bubble.
- Manual task execution system hints and visible user messages no longer include schedule/time text such as `每日 23:37`, weekly labels, cron wording, or explicit planned timestamps.
- The hidden guardrail prompt is not rendered in the UI but is used for the outbound transport message.
- Re-running the known task no longer causes the agent to create or duplicate task records during execution.
- Normal chat send, slash command send, follow-up chat, reset, and new-session behavior do not regress.
- `npm run check:encoding`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`
- `npm run tauri dev`
  - If blocked by existing port usage or unrelated large-file guard failures, record that as an environment / pre-existing blocker.

## Assumptions

- Manual execution user bubbles should show only the cleaned task body, not the task title.
- Time-removal applies only to manual execution messaging, not to task configuration or schedule displays elsewhere.
- The hidden prompt should use a strict default that forbids task/cron/reminder mutations unless the user explicitly asks again in the same conversation.
- Frontend-local prompt injection is sufficient for this phase; no backend permission gate is added.
