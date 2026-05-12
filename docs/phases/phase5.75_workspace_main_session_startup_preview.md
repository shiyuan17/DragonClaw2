# Phase 5.75: Workspace Main Session Startup Preview
> Status: Planned
> Date: 2026-05-12
> Type: Frontend session restoration / chat UX

## Background

`workspace-clone` currently restores homepage chat by selecting the main agent and then resolving the active session key directly. That keeps startup anchored to `agent:{id}:main`, but it also means users reopen the app on the older main session even when their latest real conversation happened in a newer history session.

The requested behavior is intentionally hybrid:

- Startup should still visually land on the main agent's `agent:{id}:main` session.
- If that same agent has a newer non-main history session, the chat pane should preview that conversation's full message history on first paint.
- If the user continues from that preview, the first send should transparently switch into the real history session before `chat.send`, so "what the user sees" and "where the next message goes" stay aligned.

This change must stay frontend-only and preserve all current Tauri, Gateway, and `invoke()` contracts.

## Goals

- Keep startup selection anchored to the main agent's `agent:{id}:main` session.
- Preview the main agent's most recently updated non-main session only when it is newer than `:main`.
- Make the first follow-up message automatically continue in that real previewed history session.
- Show a clear lightweight UI hint so the preview is not mistaken for the actual `:main` transcript.
- Clear the preview state as soon as the user intentionally navigates somewhere else.

## Implementation Scope

### 1. Startup Preview Resolution

- Add a frontend-only helper that inspects the selected main agent's sessions.
- Keep `selectedSessionKey` on `agent:{id}:main` during bootstrap.
- Resolve an optional `startupPreviewSessionKey` as the newest non-main session for the same agent when:
  - the non-main session exists, and
  - its `updatedAt` is strictly newer than the main session's `updatedAt`.
- Do not cross agents and do not consider synthetic task-run sessions.

### 2. Preview Display State

- Add startup preview state to `useWorkspaceGatewayChat`.
- When preview is active, load chat history from `startupPreviewSessionKey` for display only.
- Keep existing history caches, title caches, and `chat.history` requests unchanged.
- Expose preview metadata needed by the view layer, including the preview session key and a user-facing title.

### 3. First Send Auto-Switch

- If startup preview is active, `sendMessage(...)` must:
  - switch `selectedSessionKey` to `startupPreviewSessionKey`,
  - clear the startup preview state,
  - then continue through the normal send flow into that real history session.
- After that first send, all later streaming, live timeline, history refresh, and session operations behave exactly like a normal selected history session.

### 4. Preview Exit Rules

- Clear startup preview immediately when the user:
  - selects another session,
  - selects another agent,
  - creates a new session,
  - resets the current session,
  - starts a task in a new chat,
  - or when the preview target disappears / becomes invalid after refresh.

### 5. UI Communication

- Add a compact banner above the message list when startup preview is active.
- The banner should clearly explain that:
  - the page is currently showing the latest conversation record,
  - and sending a new message will automatically continue in that real session.
- Do not change history drawer ordering or the existing session list structure.

## Acceptance Criteria

- On app reopen, the homepage still selects the main agent and keeps `selectedSessionKey` on `agent:{id}:main`.
- If the main agent has a newer non-main history session, the chat pane shows that session's messages on first paint.
- The preview banner is visible while this startup preview is active.
- The first send from the preview automatically switches into the previewed history session before the outbound `chat.send`.
- Selecting a session, changing agents, creating a new chat, resetting, or starting a task-run chat clears the startup preview state.
- No Tauri command names, `invoke()` shapes, or Gateway RPC method names change.

## Verification

- Add pure helper tests for startup preview resolution.
- Add chat view coverage for the startup preview banner.
- Run `npm run check:encoding`.
- Run targeted frontend tests for the new helper and chat-view coverage.
- Manually verify:
  - reopen app -> main session stays selected,
  - newer history is previewed,
  - first follow-up send continues in that history session,
  - no-history agents still behave like the current main-session flow.
