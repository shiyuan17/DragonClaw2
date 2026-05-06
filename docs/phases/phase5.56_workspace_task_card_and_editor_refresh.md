# Phase 5.56: Workspace Task Card and Editor Refresh
> Status: Planned
> Date: 2026-05-06
> Type: Frontend visual refresh

## Summary

- Rework the `workspace-clone` task drawer cards and task editor modal without changing any Tauri command, Gateway RPC, `invoke()` contract, task handler, or Rust code.
- Keep the scope limited to the frontend render layer and workspace theme tokens.
- Preserve the compact card redesign already in progress and add one closeout pass for the remaining task drawer usability issues.

## Implementation Changes

### 1. Task Drawer Card Refresh

- Keep the task drawer focused on compact fixed-height cards only. Do not restore the inline recent-runs module or the expanded footer inside the drawer.
- Keep task card click behavior as-is: selecting a task still highlights it and continues loading runs through the existing real logic, but the drawer itself stays compact.
- Show each task as a small card with:
  - left side: task icon, human-readable task title, next execution time, loop summary
  - right side: run-now icon and more-actions icon
- Keep the title strategy human-readable first:
  - prefer `description` when it is not a slug
  - otherwise prefer `name` when it is not a slug
  - otherwise fall back to the first non-empty payload preview line
  - only use the raw internal name/id when no better label exists

### 2. Task Filter and Dropdown Closeout

- Fix the `enabled / disabled` filter tabs so they render as stable horizontal pill tabs and can always be switched manually.
- Respect the user-selected filter after refreshes and panel rerenders; only auto-fallback when the currently selected bucket becomes empty and the other bucket still has tasks.
- Isolate the task `more` dropdown from the shared generic menu button styling.
- Render the task menu as one dark floating panel with full-width row items:
  - `Run now`
  - `Pause` or `Enable`
  - `Edit`
  - `Delete`
- Keep all actions wired to the existing real callbacks: `onRunTask`, `onToggleTaskEnabled`, `onEditTask`, `onDeleteTask`.

### 3. Schedule Display and Editor Rules

- Keep the editor mapping limited to four editable modes:
  - `Once`
  - `Daily`
  - `Weekly`
  - `Monthly`
- Keep the existing rule that advanced cron expressions remain read-only in the editor modal and are not auto-converted.
- Split schedule editability from task card schedule display:
  - the editor still uses schedule parsing only to decide whether a rule is editable
  - the task card must always show a readable trigger summary
- Task card display rules:
  - `at` -> `单次 · MM/DD HH:mm`
  - simple cron -> `每天 HH:mm`, `每周三 HH:mm`, `每月 15 日 HH:mm`
  - `every` -> interval wording such as `每 30 分钟`, `每 2 小时`
  - common complex cron -> readable expanded summary when possible
  - unsupported complex cron -> `Cron · <expr>` instead of `高级 Cron 规则`
- Keep `nextRunAtMs` as the source of truth for the separate "next run" line on the card.

## Public Interfaces / Type Notes

- Do not change any `WorkspaceCron*` public type, Gateway RPC name, request parameter, response shape, or Tauri command signature.
- Only add frontend-local helpers and formatters for:
  - task filter fallback behavior
  - human-readable task schedule card summaries
  - existing modal draft state

## Test Plan

- Documentation flow:
  - update this phase document first
  - update `docs/TODO.md`
  - commit documentation separately from code
- Static checks:
  - `npm run check:encoding`
  - `npm run check:file-size`
- Startup verification:
  - `npm run tauri dev`
- Manual task drawer verification:
  - `enabled / disabled` tabs switch normally
  - no inline recent-runs block appears in the drawer
  - task cards stay fixed-height and compact
  - the more-actions menu opens correctly and keeps the real task actions working
- Manual schedule verification:
  - `once / daily / weekly / monthly` tasks show readable trigger timing
  - `every` rules show interval-based wording
  - complex cron rules do not show `高级 Cron 规则`; they show a readable summary or `Cron · <expr>`
  - the separate next-run line still shows the real next execution time
- Regression verification:
  - `systemEvent` tasks remain editable in the new modal
  - `agentTurn` tasks remain non-editable
  - history, memory, skills, tools, channel, related-resource panels, and real task run/toggle/delete flows do not regress

## Assumptions

- Removing the recent-runs module only applies to the task drawer surface; it does not remove runs data or other task detail sources.
- Monthly rules that target `29`, `30`, or `31` continue to follow native cron behavior and simply skip months without that date.
- For extremely complex cron expressions that cannot be converted safely, `Cron · <expr>` is an acceptable final fallback for task card display.
