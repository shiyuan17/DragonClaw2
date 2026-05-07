# Phase 5.56.5: Chat-First Manual Task Execution
> Status: Planned
> Date: 2026-05-07
> Type: Frontend behavior change

## Summary

- Replace manual task `Run now` with a chat-first flow that always opens a real session and sends the task as a user message.
- Stop using `cron.run` as the user-clicked execution source for manual runs.
- Reuse the existing chat stream, live timeline, abort, reset, and follow-up messaging path instead of synthetic task-run conversations.
- Align the homepage `新对话` action with a true gateway `sessions.create` flow so task execution and normal chat both use the same real-session path.

## Implementation Changes

### 1. Manual task execution becomes chat-first

- `workspace-clone` task `Run now` should no longer call `cron.run` as its main execution path.
- Manual execution must:
  - resolve the task's owning `agentId`
  - create a real gateway session for that agent
  - switch the UI into that new real session
  - insert a local system hint such as `正在执行任务：{title}`
  - send the task content as a normal user message
- No synthetic task-run conversation should be created or selected.

### 2. Payload mapping stays simple and explicit

- `systemEvent` tasks send `payload.text` as the user-visible manual execution content.
- `agentTurn` tasks send `payload.message`.
- Manual task sends may prepend a lightweight prefix such as `立即执行任务：{title}` so the agent can distinguish task execution from an ordinary freeform user chat.
- Visible task titles continue to use the shared display-title resolver.

### 3. Real-session creation becomes a shared homepage capability

- `useWorkspaceGatewayChat` should expose a real `sessions.create` helper for a target agent.
- The helper should support:
  - normal `新对话` creation from the current chat context
  - task-driven new-session creation for a specified task agent
- The homepage `新对话` action should use this helper instead of `sessions.reset`.

### 4. Manual run status no longer depends on cron bridge state

- Pending run-now bridge cards and accepted-run session binding should stop driving the manual run UX.
- `cron.list` and `cron.runs` remain for task configuration and historical run records only.
- Manual task execution should rely on the real chat session itself for visible progress and follow-up interaction.

### 5. Local task status copy belongs inside the real session

- The temporary `正在执行任务` notice should be attached to the created real session as a local system message.
- That notice should render before the first streamed assistant response and coexist with the normal chat history for that session.
- Switching sessions should not break normal history loading or real session titles.

## Public Interfaces / Type Notes

- Do not change any Tauri command name, parameter, or return shape.
- Do not change any Gateway RPC name, parameter, or return shape.
- Frontend-local changes only:
  - `useWorkspaceGatewayChat` adds a true new-session helper backed by `sessions.create`
  - homepage task execution uses that helper plus the existing chat send path
  - manual run no longer depends on frontend `cron.run` bridge state

## Test Plan

- Clicking task `Run now` opens a real new session immediately.
- The new session shows a local `正在执行任务` system hint before the agent response.
- The task payload is sent as a user message and the reply streams through the normal live timeline.
- If the currently selected UI entity is not the task's agent, manual execution still opens the correct agent session.
- Homepage `新对话` creates a new real session instead of resetting the current one.
- Normal chat send, stream, abort, history switching, and follow-up conversation do not regress.
- Task history still shows `cron.runs` records as historical data, not as the real-time manual-run source.
- `npm run check:encoding`
- `npm run check:file-size`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`
- `npm run tauri dev`

## Assumptions

- Manual task execution intentionally diverges from official `cron.run` semantics in favor of reliable visible chat execution.
- The task agent is always the source of truth for manual execution targeting.
- Sending task content as a user message is acceptable for both `systemEvent` and `agentTurn` payloads in this phase.
- A lightweight execution prefix is acceptable if needed to help the receiving agent interpret the message as a task run.
