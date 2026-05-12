# Phase 5.74.1: Workspace `/plan` Reply Meta Suppression

> Status: Planned
> Type: Workspace chat prompt governance

## Goal

Stop the builtin `workspace-clone` `/plan` command from exposing its internal planning-mode selection, spec detection walkthrough, or command execution logic in the visible assistant reply. Users should receive the plan itself, not the command's self-explanation.

## Problem

The current builtin `/plan` instruction tells the model to decide between Spec Kit planning and a read-only conversation plan. In practice, the assistant can surface that internal branch selection back to the user with preambles such as:

- "currently I will use Codex-style read-only planning"
- "Spec detection result"
- explanations about missing `specs/<feature>/spec.md`, `.specify/feature.json`, or why `plan.md` / `research.md` will not be generated

Those details are command-internal control flow, not the user's requested output. They make the reply feel mechanical and bury the actual plan below system narration.

## Scope

- Update only the frontend builtin `/plan` prompt instruction in `src/components/workspace-clone/workspaceCloneSlashCommands.ts`.
- Add frontend unit coverage for the `/plan` instruction contract.
- Do not change any Rust code, Tauri command, Gateway payload, live-step rendering, or `invoke()` signatures.

## Implementation

- Amend the builtin `/plan` instruction so planning-mode selection remains internal.
- Require the assistant to start with the user-facing plan, actionable blocker, or concise clarification question.
- Forbid user-visible narration of:
  - Spec detection order or checklist
  - "Spec Kit mode" vs "Codex-style mode" selection
  - internal reasons for not generating `plan.md`, `research.md`, or related artifacts unless the user explicitly asks why
- Keep short blocking explanations allowed when no project directory is selected or when multiple reliable specs require user choice, but phrase them as direct next-step guidance instead of command self-reporting.

## Acceptance Criteria

- `/plan 给出优化方案` no longer starts with command meta narration.
- Replies do not expose "Spec detection result", "Codex-style read-only planning", or similar internal mode-selection wording by default.
- If `/plan` lacks enough context, the assistant asks a concise next-step question without revealing the full internal decision rubric.
- Existing visible user message rendering for `/plan` remains unchanged.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run test:frontend -- workspaceCloneSlashCommands`
