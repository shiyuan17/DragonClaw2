# Phase 5.24.2: workspace-clone live timeline dedupe and running sheen

> Status: In progress
> Type: Frontend chat experience

## Goal

Keep the `workspace-clone` live timeline compact and truthful without changing any backend gateway contract, Tauri command signature, or `invoke()` payload shape.

This phase covers two user-facing behaviors:

- Deduplicate mirrored live tool and command steps so one real tool call is shown once.
- Keep running steps visually obvious with a restrained full-row sheen state.

## Scope

- Frontend-only changes in the homepage chat live timeline data and presentation layers.
- Continue listening to both `agent` and `session.tool` gateway events.
- Deduplicate mirrored or replayed live-step entries without hiding real repeated tool calls.
- Preserve the existing `thinking -> tool -> thinking bridge -> final answer` chain.

## Non-Goals

- No Rust or Tauri command changes.
- No gateway protocol or event payload changes.
- No new persisted message fields.
- No new public TypeScript contract for chat history messages.

## Original Phase 5.24.2 Rules

### Live-step dedupe

- Prefer stable business identifiers from `itemId / toolCallId / tool_call_id / id`.
- When a stable id is missing, fall back to a frontend-only operation signature derived from the current run and the rendered step content.
- Keep dedupe state in memory only and clear it on run finish, abort, reset, disconnect, session switch, and agent switch.
- Preserve status upgrades so the same step moves from `running` to `success`, `error`, or `aborted` instead of creating a second card.

### Running sheen

- Show a lightweight full-row sheen only for `running` live steps.
- Remove the sheen when a step settles into `success`, `error`, or `aborted`.

## Acceptance

- Repeated mirrored `web_search` and `web_fetch` entries collapse into a single visible tool card.
- Real repeated tool calls still render as separate cards.
- The post-tool thinking bridge still appears and clears correctly.
- `npm run build` passes.

## 2026-05-05 Follow-up

The earlier Phase 5.24.2 design was directionally correct, but the shipped frontend logic still had two important gaps:

- The stable-id path wrote dedupe cache entries but did not actually skip duplicate cards yet.
- Same-source short-window replays could still create duplicate tool rows because only cross-source mirrors were being filtered.

Phase 5.24.3 implements the follow-up without changing the gateway protocol:

- tighten stable-key and fallback-signature dedupe semantics
- suppress short-window replays while preserving real repeated calls
- add connection-generation guards so stale dev-mode or reconnect callbacks cannot write old tool events into the current `liveSteps` list

## Manual Checks

1. Trigger a search-heavy request and confirm each duplicated `web_search` or `web_fetch` card now appears once.
2. Verify a real repeated tool call still shows twice.
3. Verify the thinking bridge still appears between completed tool steps and the final assistant reply.
4. Verify abort, reset, agent switch, session switch, and reconnect do not leave stale dedupe state behind.
