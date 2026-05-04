# Phase 5.25: workspace-clone 历史会话切换、精简卡片与时间筛选

> Status: planning / implementation
> Type: frontend chat experience

## Goal

Upgrade the `workspace-clone` history drawer so users can switch between real OpenClaw sessions and continue chatting in the selected session, while replacing raw session keys with short, user-facing titles derived from the session's first meaningful user intent and refining the drawer into a Codex-like compact history list.

## Scope

- Keep using the existing OpenClaw gateway WebSocket methods only:
  - `sessions.list`
  - `chat.history`
  - `chat.send`
  - `chat.abort`
  - `sessions.reset`
- Change homepage chat state from a fixed `agent:<agentId>:main` target to an agent + selected session model.
- Allow clicking history items to switch the active session in place.
- Derive history titles on the frontend from the first meaningful user message and cache them in memory.
- Render history cards with title + time only.
- Add `全部` / `今天` / `昨天` time filters in the history drawer header.
- Preserve the existing ElevenLabs token system and drawer interaction model.

## Non-goals

- Do not change any Tauri `invoke()` contract.
- Do not change Rust command signatures or OpenClaw gateway protocol contracts.
- Do not write renamed titles back into gateway session metadata.
- Do not introduce model-generated summaries for titles.

## Title Rules

- Prefer the first meaningful `user` message in the session history.
- Normalize locally before rendering:
  - trim leading and trailing whitespace
  - collapse repeated whitespace and line breaks
  - ignore empty text, symbol-only text, and obvious non-user-facing noise
  - truncate to a short, stable single-line title
- If no valid user message exists, fall back in order:
  - `session.displayName`
  - `session.label`
  - `主会话` for `:main`
  - raw session key as the last resort
- Treat raw key-shaped values such as `agent:...` as invalid display titles and continue falling back.
- Keep subtitle data available for compatibility if needed, but do not render it in the history drawer cards.

## History UI Rules

- The history drawer header keeps the title and close button on the first row.
- A compact filter row appears below the title with three options:
  - `全部`
  - `今天`
  - `昨天`
- History cards render only:
  - summarized title
  - formatted update time
- Cards keep active, hover, and focus feedback, but the visual weight should stay lighter and cleaner than the previous info-heavy layout.
- When a filter has no matching sessions, show a clear empty state instead of a blank list.

## Acceptance Criteria

- Opening the history drawer no longer shows raw `agent:main:openai:...` strings as the primary title when user text is available.
- Clicking a non-main history item switches the chat area to that session and subsequent sends continue in that same session.
- Switching back to the main session restores the main session history and keeps send / abort / reset behavior working.
- Sessions without extractable user text still render a non-empty fallback title.
- History cards no longer render model / subtitle metadata.
- `全部`, `今天`, and `昨天` filter tabs correctly filter sessions by local calendar date using `updatedAt`.
- Agent switch, gateway reconnect, and `chat.final` refreshes do not accidentally jump into the wrong session.
- `npm run build` passes.

## Phase 5.25.1: SQLite Session Cache

### Goal

Persist homepage chat session history in a local SQLite database so switching between previously opened sessions is instant, recent session content survives app restarts, and gateway refreshes can happen in the background without blanking the message area first.

### Scope

- Add a dedicated Tauri chat-cache module backed by a single SQLite file under `~/.openclaw/`.
- Keep the homepage chat UI contract unchanged and reuse the existing history/session drawer interactions.
- Cache only stable session history payloads and derived titles.
- Refresh cached sessions from the gateway after local cache hydration when the gateway is connected.
- Retain only the most recent 20 sessions across the cache store.

### Non-goals

- Do not change existing OpenClaw gateway methods or payload contracts.
- Do not rename or modify existing Tauri command signatures.
- Do not persist streaming deltas, pending user messages, live timeline steps, or transient error state.
- Do not add encryption or remote sync for cached chat content.

### Storage Rules

- Database file path must resolve through `paths::user_config_dir()`.
- Use a single table `session_history_cache` with:
  - `session_key TEXT PRIMARY KEY`
  - `agent_id TEXT NOT NULL`
  - `updated_at INTEGER`
  - `cached_at INTEGER NOT NULL`
  - `title TEXT`
  - `messages_json TEXT NOT NULL`
- Create an `updated_at DESC` index for cache pruning and summary reads.
- Store chat messages as the raw `chat.history` JSON payload string so the frontend can continue using its current normalization logic.

### Frontend Behavior Rules

- On session switch, hydrate from SQLite cache first.
- If cache exists, render it immediately and refresh from `chat.history` in the background.
- If cache does not exist, keep the current initial loading behavior for that session.
- Update both in-memory state and SQLite after successful history reloads, title extraction, `chat.final`, and `sessions.reset`.
- Use cached titles first when building history items after app restart; only backfill from `chat.history` when a title is missing.

### Acceptance Criteria

- Switching to a previously opened session no longer clears the message list before content reappears.
- After quitting and reopening DragonClaw, cached sessions can restore their latest known history from SQLite.
- Gateway-connected refreshes keep the active session stable and do not jump back to `:main`.
- Resetting a session clears or replaces that session's cached content so stale messages do not reappear.
- The cache store is pruned to the most recent 20 sessions without mixing content between agents.
