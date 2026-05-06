# Phase 5.56: Workspace Task Card and Editor Refresh
> Status: Planned
> Date: 2026-05-06
> Type: Frontend visual refresh

## Summary

- Rework the `workspace-clone` task drawer cards and task editor modal without changing any Tauri command, Gateway RPC, `invoke()` contract, task handler, or Rust code.
- Keep the scope limited to the frontend render layer and workspace theme tokens.
- Preserve the compact card redesign already in progress and add one closeout pass for the remaining task drawer usability issues.
- Upgrade manual task `Run now` so it still uses the real OpenClaw `cron.run` path but then opens the real result session in the chat surface instead of stopping at a local queued notice.

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
- Keep `taskFilter` as the single source of truth for the visible task bucket.
- Initialize the filter only when entering the `schedule` panel or switching to a different Agent:
  - prefer `enabled` when that Agent has enabled tasks
  - otherwise initialize to `disabled`
- After the user clicks `enabled` or `disabled`, preserve that selection across task refreshes and rerenders.
- When the current bucket has no tasks, keep the selected tab active and show the corresponding empty state instead of auto-switching back.
- Isolate the task `more` dropdown from the shared generic menu button styling.
- Render the task menu as one dark floating panel with full-width row items:
  - `Run now`
  - `Pause` or `Enable`
  - `Edit`
  - `Delete`
- Keep all actions wired to the existing real callbacks: `onRunTask`, `onToggleTaskEnabled`, `onEditTask`, `onDeleteTask`.
- Route task action feedback through the existing global feedback center instead of the task drawer inline feedback cards.

### 3. Manual Run Result Flow

- Keep manual `Run now` wired to the real OpenClaw `cron.run` request. Do not replace it with a normal `chat.send` message and do not fake assistant replies in the UI.
- After `cron.run` returns `ran` or `enqueued`, immediately refresh the task list and task runs, then try to locate the newest real run session from the latest run record.
- If the newest run exposes a real `sessionKey`, switch the chat surface to that session so the user sees the true OpenClaw conversation result:
  - `main` tasks should stay on or return to the main agent session
  - `current` and `session:<id>` tasks should open that bound session
  - isolated cron runs should open the real cron result session when one is available
- If a run is accepted but its session is not available yet, keep polling the latest run records during the existing follow-up refresh window and show a global status notice such as `queued` or `locating result session`.
- If no result session can be located safely, keep the real task runs/history data refreshed and leave the result discoverable from the task detail surfaces rather than inventing a synthetic chat response.

### 4. Schedule Display and Editor Rules

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
  - `at` -> `Once · MM/DD HH:mm`
  - simple cron -> `Daily HH:mm`, `Weekly Wed HH:mm`, `Monthly 15 HH:mm`
  - `every` -> interval wording such as `Every 30 minutes`, `Every 2 hours`
  - common complex cron -> readable expanded summary when possible
  - unsupported complex cron -> `Cron · <expr>` instead of a generic advanced-cron placeholder
- Keep `nextRunAtMs` as the source of truth for the separate `next run` line on the card.

## Public Interfaces / Type Notes

- Do not change any `WorkspaceCron*` public type, Gateway RPC name, request parameter, response shape, or Tauri command signature.
- Only add frontend-local helpers and formatters for:
  - task filter fallback behavior
  - human-readable task schedule card summaries
  - task run result orchestration and feedback mapping
  - existing modal draft state

## Test Plan

- Documentation flow:
  - update this phase document first
  - update `docs/TODO.md`
  - commit documentation separately from code
- Static checks:
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm run build`
- Startup verification:
  - `npm run tauri dev`
- Manual task drawer verification:
  - `enabled / disabled` tabs switch normally
  - clicking `disabled` always switches to the disabled bucket immediately
  - while `disabled` is selected, refreshing the task list does not force the UI back to `enabled`
  - when an Agent has no disabled tasks, the `disabled` tab still stays selected and shows an empty state
  - no inline recent-runs block appears in the drawer
  - task cards stay fixed-height and compact
  - the more-actions menu opens correctly and keeps the real task actions working
- Manual task run verification:
  - clicking `Run now` still calls the real `cron.run` path
  - `ran` and `enqueued` results show a global feedback toast rather than a drawer-local notice card
  - when the latest run exposes a real `sessionKey`, the UI switches to that real chat session automatically
  - the chat area shows real OpenClaw session history, not a synthetic frontend-only task reply
  - when the task targets the main session, the main session refreshes so the real system-event result appears there
- Manual schedule verification:
  - `once / daily / weekly / monthly` tasks show readable trigger timing
  - `every` rules show interval-based wording
  - complex cron rules do not show a generic advanced-cron placeholder; they show a readable summary or `Cron · <expr>`
  - the separate next-run line still shows the real next execution time
- Regression verification:
  - `systemEvent` tasks remain editable in the new modal
  - `agentTurn` tasks remain non-editable
  - history, memory, skills, tools, channel, related-resource panels, and real task run/toggle/delete flows do not regress

## Assumptions

- Removing the recent-runs module only applies to the task drawer surface; it does not remove runs data or other task detail sources.
- Monthly rules that target `29`, `30`, or `31` continue to follow native cron behavior and simply skip months without that date.
- For extremely complex cron expressions that cannot be converted safely, `Cron · <expr>` is an acceptable final fallback for task card display.
- Manual `Run now` keeps OpenClaw as the source of truth for execution and results; frontend orchestration only helps the user open the correct real session after the task has been accepted.
