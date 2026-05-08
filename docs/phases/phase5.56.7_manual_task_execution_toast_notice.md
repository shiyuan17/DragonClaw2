# Phase 5.56.7: Manual Task Execution Toast Notice
> Status: Planned
> Date: 2026-05-08
> Type: Frontend behavior change

## Summary

- Show an immediate toast when the user clicks manual task `Run now`.
- The toast should clearly tell the user that task execution is starting before the chat session finishes switching.
- Keep the existing chat-first manual execution flow, task payload mapping, and all Tauri / Gateway / `invoke()` contracts unchanged.

## Implementation Changes

### 1. Add a lightweight pre-run feedback toast

- Reuse the existing frontend feedback center instead of adding a new toast system.
- Trigger an `info` toast from the `workspace-clone` manual task click entry point before awaiting the new-session execution promise.
- The copy should communicate that the selected task is already being executed, for example `正在执行中`.

### 2. Keep execution semantics unchanged

- Do not change how the task agent is resolved.
- Do not change `runTaskInNewChat(...)`, session creation, outbound transport text, or live timeline bridging.
- Do not add new backend status endpoints, frontend polling, or optimistic cron state changes for this phase.

### 3. Scope stays limited to the task click flow

- Limit code changes to the existing manual task button handler and feedback-hook wiring.
- Do not modify task editor behavior, recent runs rendering, or unrelated workspace panels.

## Public Interfaces / Type Notes

- No Tauri command changes.
- No Gateway RPC changes.
- No `invoke()` signature or payload changes.
- Frontend-only behavior update using the existing feedback provider.

## Test Plan

- Clicking task `Run now` immediately shows a toast telling the user the task is executing.
- After the toast appears, the current chat-first manual task execution flow still opens the correct agent session and sends the task payload as before.
- Repeated clicks do not create an uncontrolled stack of duplicate toasts.
- Normal chat send, new chat, task edit, task delete, and task enable/disable flows do not regress.
- `npm run check:encoding`
- `npm run check:file-size`
- `npm exec tsc -- --noEmit --pretty false`

## Assumptions

- A short informational toast is sufficient; this phase does not require a persistent loading indicator.
- The existing task system message inside the created chat session remains the detailed in-session execution cue; the toast only provides immediate click feedback.
