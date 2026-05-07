# Phase 5.56.3: Align Run-Now With Official OpenClaw Task Semantics
> Status: Planned
> Date: 2026-05-07
> Type: Frontend behavior alignment

## Summary

- Re-align `workspace-clone` task execution with official OpenClaw cron semantics instead of extending a frontend-only task mode model.
- Treat `openclaw cron run <jobId>` as a force-run-now action, not a scheduled-time replay.
- Keep `sessionTarget="main"` on the main-session system-event path and reserve real session switching for runs that actually produce a real session.
- Remove the newly exposed user-facing `模式` UI so the frontend stops introducing a second concept layer beyond upstream task fields.
- Recover legacy synthetic task-run conversations by binding them to real gateway sessions before send/reset/new-chat actions continue.

## Implementation Changes

### 1. Run-now follows upstream semantics

- Clicking `Run now` must no longer create or select an unbound synthetic task conversation up front.
- After `cron.run` is accepted, keep the user in the current normal session and show a non-chat execution notice while the frontend waits for either:
  - a real `sessionKey` / `sessionId`
  - a terminal run record that proves the run finished without a bindable session
- Only switch into chat when a real session is resolved.
- `sessionTarget="isolated"` may switch into a real session and continue live timeline / streaming once that session exists.
- `sessionTarget="main"` must stay on the system-event path and must not open a new chat session just because the task was triggered manually.
- For manual `Run now` on `main + systemEvent`, always force immediate wake behavior instead of preserving delayed heartbeat semantics.

### 2. Result matching and closeout become stricter

- Match follow-up results conservatively:
  - prefer the accepted `runId` when present
  - otherwise require a run record that is clearly newer than the pre-click baseline
- Do not treat the latest finished run record as the answer for the current click unless it matches the current run context.
- If only a terminal run record arrives:
  - `isolated` tasks show a terminal notice only and do not pretend to be a chat session
  - `main` tasks show system-event completion/failure/skip feedback in place
- Any skipped/error/no-session terminal closeout must clear frontend active-run state, thinking bridges, live steps, and streaming leftovers.

### 3. Legacy synthetic task sessions recover through real-session binding

- Existing unbound synthetic task-run sessions remain in history, but message send/reset/new-chat must no longer fail on them.
- Before those actions continue, resolve and bind a real fallback gateway session for the same agent.
- Default fallback is that agent's main real session.
- If a later real task result session is resolved, update the synthetic task session binding idempotently without creating duplicate history rows.

### 4. UI and editor remove the extra mode layer

- Remove the visible `模式` line from task cards, task details, and any other user-visible task surfaces added during the interrupted implementation.
- Remove the visible `Agent 对话 / 系统事件` selector from the task editor modal.
- Keep editor compatibility with the existing upstream payload union:
  - `systemEvent` edits `text`
  - `agentTurn` edits `message`
- Preserve the stored payload kind on save; this phase does not add a frontend kind conversion workflow.
- Keep user-facing wording anchored to upstream concepts such as `主会话`, `独立执行`, `当前会话`, and `指定会话`.

### 5. Agent recent sessions stay restored

- Keep the `agentRecentSessionsById` UI-facing helper in `useWorkspaceGatewayChat`.
- The directory nested list continues to show only real gateway sessions, never synthetic task-run rows.
- `WorkspaceCloneDirectory` continues to require `currentSessionKey` and `onSelectSession`, preserving main-row agent selection plus nested real-session switching.

## Public Interfaces / Type Notes

- Do not change any Tauri command name, parameter, return shape, or `invoke()` contract.
- Do not change any Gateway RPC name, parameter, or return shape.
- Frontend-local changes are limited to:
  - run-now bridge state semantics
  - real-session fallback binding helpers for synthetic task conversations
  - task-run closeout cleanup helpers
  - task editor rendering rules for existing payload kinds
- This phase does not introduce any new user-visible task mode field or frontend-only task type system.

## Test Plan

- `Run now` does not open an empty synthetic task chat immediately.
- `isolated` tasks switch into a real resolved session when one is produced and continue streaming there.
- `main + systemEvent` manual runs stay in place, trigger immediate wake, and do not open a fake task chat.
- Terminal no-session runs clear all thinking/live-run state and show explicit completion/skip/failure feedback.
- Legacy unbound task sessions can send, reset, and start new chat after fallback binding resolves.
- Task cards, task details, and the task editor no longer show the extra `模式` UI.
- The employee directory still shows its nested recent real sessions and switching them continues to work.
- `npm run check:encoding`
- `npm run check:file-size`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`
- `npm run tauri dev`

## Assumptions

- OpenClaw official task semantics are the single source of truth for this phase.
- Whether a task acts like a reminder, a fetch, or a tool-using autonomous job is decided by the upstream agent/runtime, not by a frontend task-mode switch.
- Manual `Run now` for `main + systemEvent` always forces immediate wake in this phase.
- Existing partial working-tree changes from the interrupted implementation must be cleaned up as part of this phase and are not considered already complete.
