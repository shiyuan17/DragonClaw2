# Phase 5.72: Project-Aware `/spec` and Adaptive `/plan`

## Summary

Add two readonly builtin slash commands to the `workspace-clone` command system:

- `/spec` creates or proposes project-aware Spec Kit-style feature specification artifacts for the currently selected working directory.
- `/plan` first detects whether the selected project has reliable spec artifacts, then chooses Spec Kit artifact planning or a Codex-style read-only conversation plan.

The commands are implemented as builtin prompt instructions over the existing slash command transport block. This phase does not add Tauri commands, change Gateway payloads, or alter frontend `invoke()` contracts.

## Goals

- Make `/spec` operate on the user-selected project, not on DragonClaw conventions by default.
- Let `/spec` inspect the selected project rules, manifests, docs, tests, and `.specify/` metadata before deciding the artifact shape.
- Let `/plan` use Spec Kit-style planning only when a reliable `specs/<feature>/spec.md` exists or is explicitly selected.
- Fall back to a Codex-style read-only implementation plan when no reliable spec exists.
- Keep custom slash command persistence and existing `/kb-*` commands unchanged.

## Implementation

- Extend `WORKSPACE_BUILTIN_SLASH_COMMANDS` in `workspaceCloneSlashCommands.ts` with readonly `/spec` and `/plan` entries.
- `/spec` instruction:
  - Require the current `[DC_WORKSPACE_DIRECTORY_V1]` cwd as the project root.
  - Inspect project-local rules such as README, manifests, tests, docs, AGENTS/CLAUDE/GEMINI files, and `.specify/`.
  - If `.specify/` exists, follow its templates, constitution, and feature metadata.
  - Otherwise use a minimal Spec Kit-compatible structure under `specs/<NNN-short-name>/`.
  - Keep `spec.md` focused on WHAT/WHY and generate a requirements checklist.
- `/plan` instruction:
  - Resolve explicit user-selected specs first.
  - Prefer `.specify/feature.json` when it points to a valid spec.
  - Use a single detected `specs/*/spec.md` only when it is the only reliable spec.
  - Ask the user to choose when multiple specs exist.
  - Use conversation-only read planning when no reliable spec exists.

## Interfaces

- No new Tauri command.
- No changes to `load_custom_slash_commands()` or `save_custom_slash_commands()`.
- No Gateway protocol change.
- No changes to `chat.send` payload shape.
- Builtin commands remain readonly in the command management modal.

## Test Plan

- Run `npm run check:encoding`.
- Run `npm run check:file-size`.
- Run `npx tsc --noEmit`.
- Manually verify:
  - `/` suggestions include `/spec` and `/plan`.
  - The command management modal shows `/spec` and `/plan` as builtin readonly commands.
  - `/spec` asks for a selected project when no working directory context is present.
  - `/plan` falls back to a read-only conversation plan when no reliable spec exists.
  - `/plan` uses Spec Kit-style artifact planning when a single reliable spec is detected.
  - Multiple specs cause `/plan` to ask the user to choose a target feature.
  - Custom slash command create/edit/delete persistence still works.

## Assumptions

- DragonClaw does not bundle or invoke the Spec Kit CLI in this phase.
- The commands rely on hidden prompt instructions rather than a hard runtime permissions sandbox.
- `/tasks` and `/implement` are future extensions and are intentionally out of scope.
