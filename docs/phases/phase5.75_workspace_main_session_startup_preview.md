# Phase 5.75: Workspace Main Session Startup Preview and Failure Attribution
> Status: Implemented
> Date: 2026-05-12
> Type: Frontend session restoration / chat UX

## Background

`workspace-clone` currently restores homepage chat by selecting the main agent and then resolving the active session key directly. That keeps startup anchored to `agent:{id}:main`, but it also means users reopen the app on the older main session even when their latest real conversation happened in a newer history session.

Phase 5.75 originally implemented a hybrid flow where startup stayed anchored to `agent:{id}:main`, but the chat pane previewed a newer non-main history session and the first follow-up send was transparently redirected into that history session. That behavior improved first paint context, but it also split the chat state into multiple concurrent truths:

- the selected homepage session stayed on `agent:{id}:main`
- the displayed history could come from a different `previewSessionKey`
- the first send could target that preview session instead of the selected main session

That split makes failure analysis harder and increases the chance that a gateway error or reconnect turns into a confusing UI state such as a lone `思考中 / 失败` live step without a clear reason. This hotfix keeps the useful startup preview, but demotes it to read-only display state and restores a single real send target unless the user explicitly chooses to continue a history session.

This change stays frontend-only and preserves all current Tauri, Gateway, and `invoke()` contracts.

## Goals

- Keep startup selection anchored to the main agent's `agent:{id}:main` session.
- Preview the main agent's most recently updated non-main session only when it is newer than `:main`.
- Keep startup preview read-only by default so the real send target stays the selected main session.
- Provide an explicit user action to continue the previewed history session.
- Show a clear lightweight UI hint so the preview is not mistaken for the actual `:main` transcript.
- Replace ambiguous `思考中 / 失败` terminal states with explicit chat failure attribution.
- Clear the preview state as soon as the user intentionally navigates somewhere else.

## Implemented Scope

### 1. Startup Preview Resolution

- Added a frontend-only helper that inspects the selected main agent's sessions.
- Kept `selectedSessionKey` on `agent:{id}:main` during bootstrap.
- Resolved an optional preview session as the newest non-main session for the same agent only when it is newer than the main session.
- Kept the logic scoped to the current agent and excluded synthetic task-run sessions.

### 2. Preview Display State

- Added startup preview state to `useWorkspaceGatewayChat`.
- Kept the real send target anchored to the selected main session while preview is active.
- Preserved existing history caches, title caches, and `chat.history` behavior.
- Exposed preview metadata and an explicit continue action to the view layer.

### 3. Explicit Continue Instead of Auto-Switch

- Removed the transparent first-send redirect into `startupPreviewSessionKey`.
- Added an explicit continue action that switches `selectedSessionKey` into the previewed history session before the next send.
- If the user sends while preview is still active, the preview is cleared and the normal main-session send flow is used.

### 4. Preview Exit Rules

- Clear startup preview immediately when the user:
  - selects another session,
  - selects another agent,
  - sends a new message from the main session while preview is active,
  - creates a new session,
  - resets the current session,
  - starts a task in a new chat,
  - or when the preview target disappears after refresh.
- If reconnect or history loading becomes unstable while preview is active, the preview falls back to the main session instead of preserving split state.

### 5. Failure Attribution and UI Communication

- Added a compact banner above the message list when startup preview is active.
- Added a compact failure card for send, model, and reconnect failures with source plus `sessionKey` and `runId` when available.
- If a run fails before any non-thinking live step appears, the UI now replaces a bare `思考中 / 失败` step with an explicit title such as `会话发送失败`, `模型返回错误`, or `网关连接丢失`.
- Kept the history drawer ordering and session list structure unchanged.

## Acceptance Criteria

- On app reopen, the homepage still selects the main agent and keeps `selectedSessionKey` on `agent:{id}:main`.
- If the main agent has a newer non-main history session, the chat pane can preview that session while main remains the real send target.
- The preview banner is visible while startup preview is active.
- Sending from the preview without explicitly switching does not auto-target the preview session.
- Clicking the explicit continue action switches into the previewed history session before the next outbound `chat.send`.
- Selecting a session, changing agents, creating a new chat, resetting, or starting a task-run chat clears the startup preview state.
- Chat send failures, model error events, and reconnect failures render explicit failure context instead of only a terminal thinking step.
- No Tauri command names, `invoke()` shapes, or Gateway RPC method names changed.

## Verification

- Added pure helper tests for startup preview resolution.
- Added chat view coverage for the startup preview banner and failure card.
- Added `useWorkspaceGatewayChat` coverage for session-target behavior and chat failure attribution.
- Passed `npm run check:encoding`.
- Passed `npm run check:file-size`.
- Passed targeted frontend tests for startup preview, chat send behavior, and chat-view coverage.
