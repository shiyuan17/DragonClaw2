# Phase 5.74: Workspace Chat Output Pipeline Refinement

> Status: Planned
> Type: Workspace chat output governance

## Goal

Make the `workspace-clone` chat surface show the user's real intent, compact execution progress, and final assistant result without leaking hidden workspace context, slash-command instructions, raw tool payloads, command output, or late-arriving process noise.

This phase keeps all Rust, Tauri command, Gateway event, and `invoke()` contracts unchanged. The implementation is limited to frontend message normalization, streaming buffering, live-step presentation, visibility filtering, and chat styles.

## Current Output Flow

1. Composer sends `homepageChat.sendMessage(value, options)` from `WorkspaceClonePage`.
2. `useWorkspaceGatewayChat.sendMessage()` builds a hidden transport message with workspace directory, knowledge base, selected skills, and slash-command instruction blocks.
3. `chat.send` writes that transport text to the Gateway while the UI adds an optimistic user message.
4. Gateway emits `agent` / `session.tool` events, which are converted into live timeline rows by `live-steps.ts`.
5. Gateway emits `chat` delta/final events. Delta text is sanitized and placed into `streamText`; final reloads `chat.history`.
6. History messages are normalized by `message-normalizers.ts`, then `WorkspaceCloneMessagePreview` applies the final display sanitizer.

## Problems Found

- Slash-command sends only showed the plain user text in the optimistic bubble; after history reload, the hidden `[DC_WORKSPACE_*]` transport blocks could become visible.
- Streaming assumed each delta was a cumulative full string, so short incremental chunks were dropped and only appeared after final history reload.
- Tool/process payloads could appear as assistant messages or mixed tails after a normal answer.
- Live-step cards were too large for frequent tool activity and exposed too much command detail in the main chat surface.
- Directory listings, `Process exited with signal SIGKILL`, `(no output recorded)`, raw JSON, and stdout/stderr-style content should not render as chat messages.

## Implementation Plan

- Add a visible-message helper for slash-command sends so the UI displays `/command user text` while the hidden transport blocks remain internal.
- Normalize history user messages through the same helper so final reload never shows hidden workspace directory, skill, knowledge, or command instruction blocks.
- Replace stream text length comparison with a run-level merge helper that accepts cumulative deltas, incremental chunks, duplicate chunks, and overlapping chunks.
- Tighten assistant visibility filtering for transport blocks, tool/process JSON, command transcripts, directory listings, no-output process exits, and mixed raw tails.
- Compact live timeline rows to a Codex-style execution list with fewer retained steps, smaller icons, shorter labels, and no stdout/stderr body in the chat surface.

## Acceptance Criteria

- Sending `/plan 给出优化方案` displays `/plan 给出优化方案` in the user bubble and never shows the hidden instruction block after final/history reload.
- Streaming answers continue to grow during generation even when the Gateway sends incremental chunks instead of cumulative text.
- The main chat hides raw tool messages, directory listings, SIGKILL/no-output status lines, raw command transcripts, and process JSON/HTML.
- Tool progress remains visible as compact live timeline rows with status only.
- Switching sessions, refreshing history, and reopening the app use the same display rules.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run test:frontend -- workspace-gateway`
- `npm run build`
- `npm run tauri dev`
