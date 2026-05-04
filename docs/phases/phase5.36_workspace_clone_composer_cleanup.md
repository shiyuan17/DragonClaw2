# Phase 5.36: workspace-clone composer cleanup
> Status: In Progress
> Date: 2026-05-03
> Type: Frontend UI cleanup

## Background

The `workspace-clone` chat composer still included a placeholder tool area and extra pills that made the input row feel busier than needed.

## Goal

- Remove the highlighted placeholder tool icon group from the chat composer.
- Remove the `记忆` and `技能库` pills from the composer row.
- Keep the default composer pills visually muted, with active highlighting only when the scene toggle is open.
- Add lightweight icons to the `命令` and `模型` pills.
- Keep existing send, stop, new chat, command, model, and scene preset behavior unchanged.
- Limit the change to frontend render structure only, without touching backend commands or `invoke()` contracts.

## Scope

1. Update `WorkspaceCloneComposer.tsx`
- Remove the unused placeholder tool button block.
- Remove the `记忆` and `技能库` pills.
- Make the remaining pills feel quieter in their default state.
- Add icons to the `命令` and `模型` entries.

2. Keep existing composer capabilities
- Preserve textarea, submit, abort, reset session, command entry, and model config entry.
- Do not change event handler internals or gateway wiring.

## Acceptance

- The chat input no longer shows the highlighted icon group.
- The chat input no longer shows the `记忆` and `技能库` pills.
- The default pills stay visually muted, and only the active scene toggle shows a highlight.
- `命令` and `模型` both include icons.
- Command entry, model selection, send, stop generation, and new chat still work as before.
