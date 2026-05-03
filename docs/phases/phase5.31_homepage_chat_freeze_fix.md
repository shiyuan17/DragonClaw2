# Phase 5.31: Homepage Chat Freeze Fix
> Status: Planned
> Date: 2026-05-03
> Type: Frontend performance / gateway resilience

## Background

After Phase 5.29 and Phase 5.30, employee data, SkillHub market data, modal data, and most non-homepage resources are no longer the main first-screen cost. A manual freeze report still shows the ready homepage stuck at "connecting homepage chat" with the Windows window state marked as not responding.

Inspection found four remaining high-risk causes:

- `WorkspaceGatewayClient` can process both `error` and `close` for the same socket and schedule duplicate reconnect timers.
- Initial gateway bootstrap loads `chat.history(200)`, then the `currentSessionKey` effect loads the same history and `sessions.list` again.
- `WorkspaceCloneMessagePreview` imports `react-markdown` and `remark-gfm` at module load, pulling markdown parser code into the ready chunk before any message needs it.
- Global `service-log` events update React log state one entry at a time, causing ready-page rerenders during noisy startup.

## Goals

- Keep the homepage responsive while gateway connection is pending, failing, or reconnecting.
- Load current chat history once per selected session and cap the first load to a small recent window.
- Move markdown rendering into an on-demand lazy chunk.
- Batch high-frequency log updates without removing the global log buffer.
- Preserve all existing Tauri command signatures and gateway request method names.

## Implementation Scope

### 1. Gateway Connection Guard

- Add stale socket guards to websocket event callbacks.
- Make disconnect handling idempotent for each socket lifecycle.
- Clear any existing reconnect timer before scheduling a new one.
- Add a handshake timeout that follows the same disconnect and backoff path.

### 2. Homepage Chat Loading

- Keep bootstrap responsible for `sessions.subscribe`, `agents.list`, `sessions.list`, and selected agent/session resolution only.
- Make the selected-session effect the only initial `chat.history` loader.
- Reduce first history load from 200 messages to a small constant such as 50.
- Add request sequencing so stale or duplicate history responses cannot overwrite newer state.

### 3. Message Rendering Cost

- Remove top-level `react-markdown` and `remark-gfm` imports from the ready chunk.
- Render plain text and JSON synchronously.
- Load markdown renderer only for detected markdown assistant messages, with a lightweight fallback.
- Memoize visible message filtering so message classification is not repeated unnecessarily.

### 4. Log Update Pressure

- Keep the global `service-log` listener and 300-entry in-memory cap.
- Buffer incoming log entries and flush them to React state on a short interval.
- Keep log row derivation gated behind the log drawer/detail state.

## Acceptance Criteria

- `npm run build` passes.
- Ready chunk no longer contains `micromark`, `fromMarkdown`, `react-markdown`, or `remark-gfm`.
- Ready chunk still does not contain employee index/profile/template data.
- Initial selected session calls `chat.history` once with the new first-load limit.
- `cargo test --manifest-path src-tauri\Cargo.toml --lib` passes.
- Manual check: entering the ready homepage stays interactive within 3 seconds even while gateway chat is connecting or reconnecting.
- Manual check: markdown messages still render after the markdown lazy chunk loads.
- `docs/TODO.md` remains unchecked until manual UI acceptance.
