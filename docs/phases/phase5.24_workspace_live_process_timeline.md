# Phase 5.24: workspace-clone live process timeline

> Status: planning / implementation
> Type: frontend chat experience

## Goal

Add a lightweight live process timeline to the `workspace-clone` chat area so users can see what the Agent is doing before the final answer arrives: thinking, calling skills/tools, running commands, and finishing or failing steps.

## Scope

- Consume existing OpenClaw gateway WebSocket events only.
- Advertise the `tool-events` client capability from the frontend gateway client.
- Render current-run live steps in the streaming assistant message.
- Keep final history behavior unchanged after `chat.final`.
- Use summary-first step display and avoid full stdout/stderr or large tool payloads.

## Non-goals

- Do not change Rust/Tauri command signatures.
- Do not modify OpenClaw engine or introduce a new gateway protocol.
- Do not persist live steps into chat history.
- Do not change `chat.send`, `chat.abort`, history loading, or Markdown/JSON final preview behavior.

## Acceptance Criteria

- During a live run, the chat area shows immediate process rows for thinking, tool calls, item events, and command output events.
- Tool and command rows display concise labels such as tool name, command title, status, and failure state without dumping full outputs.
- Final, abort, error, session switch, and agent switch clear active live steps so stale running rows do not remain.
- `npm run build` passes.
