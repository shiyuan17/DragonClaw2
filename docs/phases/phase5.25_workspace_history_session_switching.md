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
