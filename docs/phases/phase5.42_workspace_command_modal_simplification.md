# Phase 5.42: Workspace Command Modal Simplification and Editor Refresh
> Status: In Progress
> Date: 2026-05-04
> Type: Frontend UI refinement

## Background

The current `workspace-clone` slash command modal still uses a split layout with separate builtin/custom sections and an inline editor block. That structure feels heavier than the referenced design and makes the command list harder to scan.

## Goal

- Simplify the command management popup into a single list.
- Use small inline tags to distinguish command source instead of separate list sections.
- Move create/edit into a dedicated centered editor modal that follows the provided visual reference.
- Keep all command loading, saving, activation, and message transport behavior unchanged.
- Limit the work to frontend render and styling only.

## Scope

1. Update `WorkspaceCloneCommandsModal.tsx`
- Replace the two-column split with a single unified command list.
- Merge builtin and custom items into one ordered list, keeping builtin items first.
- Show source tags for each command row: `系统` or `自定义`.
- Keep builtin rows read-only.
- Keep custom rows editable/deletable and still clickable for activation.
- Replace the inline editor panel with a dedicated nested modal.

2. Refresh the add/edit command UI
- Reuse the existing draft state and save/cancel handlers.
- Present the form in a compact single-column dialog.
- Keep the existing fields and generated command preview semantics unchanged.

3. Update `workspace-clone.css`
- Remove command-modal styles that only exist for the old split grid layout.
- Add unified list row, tag, and editor dialog styles using existing `--dc-*` and `--dc-workspace-*` tokens.
- Keep mobile behavior single-column and usable at narrow widths.

## Acceptance

- The command popup shows one list rather than separate builtin/custom sections.
- Every command row displays a source tag.
- The active command still highlights correctly.
- Builtin rows remain read-only and do not show edit/delete actions.
- Clicking `新建命令` or `编辑` opens a dedicated centered form modal.
- Save, cancel, delete, search, and activation behavior remain unchanged.
- No backend command, `invoke()` contract, slash-command schema, or hook API changes are introduced.
